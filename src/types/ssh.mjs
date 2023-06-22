// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'
import ora from 'ora'

import { applyRetentionRules } from '../retention.mjs'
import { retrieve } from '../retrieve.mjs'

$.verbose = false

export async function runSSH(systemConfig, service) {
	const	start_date = DateTime.now().toFormat("yyyy-LL-dd'T'HH-mm-ss")
	var		spin = undefined

	console.log(`${chalk.blue(`${chalk.bold(service.name)} (${start_date})`)}`)

	const temp_dir = path.join(systemConfig.temp_dir, service.backup_dir, start_date)
	const backup_dir = path.join(systemConfig.backup_dir, service.backup_dir, start_date)

	try {
		// Create dir
		await $`mkdir -p ${temp_dir}`

		// Run before command
		if (service.commands && service.commands.before != "") {
			spin = ora('Running "before" command on server').start()
			await $`ssh ${service.ssh_host} ${service.commands.before}`
			spin.succeed()
		}

		// Download backup
		if (service.retrieve) {
			spin = ora('Downloading backup').start()
			await retrieve(service.retrieve, temp_dir, service.ssh_host)
			spin.succeed()
		}

		// Run after command
		if (service.commands && service.commands.after != "") {
			spin = ora('Running "after" command on server').start()
			await $`ssh ${service.ssh_host} ${service.commands.after}`
			spin.succeed()
		}

		cd(path.join(temp_dir, '..'))

		// Create archive
		spin = ora('Creating an archive').start()
		await $`mkdir -p ${path.join(backup_dir, '..')}`
		await $`tar -cjf ${backup_dir}.tar.bz2 ${start_date}`

		// Get archive size
		let archive_size = await $`du -h ${backup_dir}.tar.bz2 | cut -f 1 | tr '\n' ' ' | sed '$s/ $//'`
		spin.succeed()

		// Delete downloaded
		await $`rm -rf ${path.join(temp_dir, '..')}`

		spin = ora('Applying retention rules').start()
		await applyRetentionRules(path.join(backup_dir, '..'))
		spin.succeed()

		console.log(chalk.green("done"))
		return `✅  ${service.name} (${archive_size})`
	}
	catch (err) {
		if (spin)
			spin.fail()
		return `❌  ${service.name} (${err.toString().replace(/\n/g, '')})`
	}
}
