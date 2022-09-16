// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'
import ora from 'ora'

import { applyRetentionRules } from './retention.mjs'

$.verbose = false

export async function runLocal(service) {
	const	start_date = DateTime.now().toFormat("yyyy-LL-dd'T'HH-mm-ss")
	var		spin = undefined

	console.log(`${chalk.blue(`${chalk.bold(service.name)} (${start_date})`)}`)

	try {
		// Create dir
		await $`mkdir -p ${service.backup_dir}/${start_date}`

		// Run before command
		if (service.commands.before && service.commands.before != "") {
			spin = ora('Running "before" command locally').start()
			cd(`${service.backup_dir}/${start_date}`)
			await $`sh -c ${service.commands.before}`
			cd(path.join(__dirname, '..'))
			spin.succeed()
		}

		// Download backup
		if (service.retrieve) {
			let rsync_args = []
			rsync_args.push(`-a`)
			if (service.retrieve.host == "")
				rsync_args.push(`${service.retrieve.path}`)
			else
				rsync_args.push(`${service.retrieve.host}:${service.retrieve.path}`)
			rsync_args.push(`${service.backup_dir}/${start_date}`)

			spin = ora('Downloading backup').start()
			if (service.retrieve.rsync_path == "")
				await $`rsync ${rsync_args}`
			else
				await $`rsync --rsync-path=${service.retrieve.rsync_path} ${rsync_args}`
			spin.succeed()
		}

		// Run after command
		if (service.commands.after && service.commands.after != "") {
			spin = ora('Running "after" command on locally').start()
			cd(`${service.backup_dir}/${start_date}`)
			await $`sh -c ${service.commands.after}`
			cd(path.join(__dirname, '..'))
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
		await $`rm -rf ${start_date}`

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
