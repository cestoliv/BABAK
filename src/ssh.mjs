// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'
import ora from 'ora'

import { applyRetentionRules } from './retention.mjs'

$.verbose = false

export async function runSSH(service) {
	const	start_date = DateTime.now().toFormat("yyyy-LL-dd'T'HH-mm-ss")
	var		spin = undefined

	console.log(`${chalk.blue(`${chalk.bold(service.name)} (${start_date})`)}`)

	try {
		// Create dir
		await $`mkdir -p ${service.backup_dir}`

		// Run before command
		if (service.commands.before != "") {
			spin = ora('Running "before" command on server').start()
			await $`ssh ${service.ssh_host} ${service.commands.before}`
			spin.succeed()
		}

		// Download backup
		let rsync_args = []
		rsync_args.push(`-a`)
		rsync_args.push(`${service.ssh_host}:${service.retrieve.path}`)
		rsync_args.push(`${service.backup_dir}/${start_date}`)

		spin = ora('Downloading backup').start()
		if (service.retrieve.rsync_path == "")
			await $`rsync ${rsync_args}`
		else
			await $`rsync --rsync-path=${service.retrieve.rsync_path} ${rsync_args}`
		spin.succeed()

		// Run after command
		if (service.commands.after != "") {
			spin = ora('Running "after" command on server').start()
			await $`ssh ${service.ssh_host} ${service.commands.after}`
			spin.succeed()
		}

		cd(service.backup_dir)

		// Create archive
		spin = ora('Creating an archive').start()
		await $`tar -cjf ${start_date}.tar.bz2 ${start_date}`

		// Get archive size
		let archive_size = await $`du -h ${start_date}.tar.bz2 | cut -f 1 | tr '\n' ' ' | sed '$s/ $//'`
		spin.succeed()

		// Delete downloaded
		await $`rm -rdf ${start_date}`

		spin = ora('Applying retention rules').start()
		await applyRetentionRules(service.backup_dir)
		spin.succeed()

		console.log(chalk.green("done"))
		return `✅  ${service.name} (${archive_size})`
	}
	catch (err) {
		spin.fail()
		return `❌  ${service.name} (${err.toString().replace(/\n/g, '')})`
	}
}
