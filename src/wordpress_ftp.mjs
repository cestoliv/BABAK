// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import ftp from 'basic-ftp'
import moment from 'moment'
import ora from 'ora'

$.verbose = false

const htaBlockSQL = `
# BEGIN BlockSQLDownload
<Files ~ "\\.sql\$">
Order allow,deny
Deny from all
</Files>
# END BlockSQLDownload`

async function hta_addSql(hta_path) {
	let hta = await fs.readFile(hta_path, 'utf-8')

	// add block
	if (!hta.includes(htaBlockSQL))
		hta = `${hta}${htaBlockSQL}`
	await fs.writeFile(hta_path, hta)
}

async function hta_removeSql(hta_path) {
	let hta = await fs.readFile(hta_path, 'utf-8')

	// remove block
	hta = hta.replace(htaBlockSQL, '')

	await fs.writeFile(hta_path, hta)
}

async function createDumpScript(script_path, service) {
	await fs.writeFile(script_path, `<?
	system("mysqldump --host=${service.database.host} --user=${service.database.user} --password=${service.database.password} ${service.database.name} > db.sql");
	echo "started";
	?>`)
}

export async function runWordpressFtp(service) {
	const	start_date = moment().format('YYYY-MM-DDTHH-mm-ss')
	const	backup_path = `../${service.backup_dir}/${start_date}`
	const	client = new ftp.Client()
	var		spin = undefined

	client.ftp.verbose = false

	console.log(`${chalk.blue(`${chalk.bold(service.name)} (${start_date})`)}`)

	try {
		// Connect to FTP
		await client.access({
			host: service.ftp.host,
			user: service.ftp.user,
			password: service.ftp.password,
			secure: service.ftp.secure
		})
		await client.cd(service.ftp.dir)

		// Create dir
		await $`mkdir -p ${backup_path}`

		spin = ora('Uploading scripts to the server').start()
		// Modify .htaccess to forbid .sql files download
		await client.downloadTo(`${backup_path}/.htaccess`, '.htaccess')
		await hta_addSql(`${backup_path}/.htaccess`)
		await client.uploadFrom(`${backup_path}/.htaccess`, '.htaccess')

		// Put the PHP dump script on the server
		await createDumpScript(`${backup_path}/db-dump.php`, service)
		await client.uploadFrom(`${backup_path}/db-dump.php`, 'db-dump.php')
		spin.succeed()

		spin = ora('Waiting for the database dump to exist on the server').start()
		// Create database dump
		await $`curl ${service.host}/db-dump.php`
		// Wait until db.sql exists on server
		let dump_created = false
		while (!dump_created) {
			let ftp_files = await client.list()
			for (let f = 0; f < ftp_files.length; f++) {
				if (ftp_files[f].name == "db.sql") {
					dump_created = true
					break;
				}
			}
			await sleep(15000)
		}
		spin.succeed()

		// Remove db-dump.php script from server
		await client.remove('db-dump.php')

		// Download DUMP
		spin = ora('Downloading the database dump').start()
		await client.downloadTo(`${backup_path}/db.sql`, 'db.sql')
		spin.succeed()

		spin = ora('Removing scripts and dump from server').start()
		// Remove db.sql from server
		await client.remove('db.sql')

		// Put back the original .htaccess file
		await hta_removeSql(`${backup_path}/.htaccess`)
		await client.uploadFrom(`${backup_path}/.htaccess`, '.htaccess')
		spin.succeed()

		// Remove working files
		await $`cd ${backup_path} && rm .htaccess db-dump.php`

		// Download WWW dir (with db.sql inside)
		spin = ora('Downloading www directory').start()
		await client.downloadToDir(`${backup_path}`)
		spin.succeed()

		/// ARCHIVE
		cd(`../${service.backup_dir}`)

		// Create archive
		spin = ora('Creating an archive').start()
		await $`tar -cjf ${start_date}.tar.bz2 ${start_date}`

		// Get archive size
		let archive_size = await $`du -h ${start_date}.tar.bz2 | cut -f 1 | tr '\n' ' ' | sed '$s/ $//'`
		spin.succeed()

		// Delete downloaded
		await $`rm -rdf ${start_date}`

		cd(__dirname)

		client.close()
		console.log(chalk.green("done"))
		return `✅  ${service.name} (${archive_size})`
	}
	catch(err) {
		try {
			client.close()
		} catch (e) {}
		spin.fail()
		return `❌  ${service.name} (${err.toString().replace(/\n/g, '')})`
	}
}
