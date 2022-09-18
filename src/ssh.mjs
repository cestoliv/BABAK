// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'
import ora from 'ora'

import { applyRetentionRules } from './retention.mjs'
import { retrieve } from './retrieve.mjs'

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
		if (service.retrieve) {
			spin = ora('Downloading backup').start()
			await retrieve(service.retrieve, `${service.backup_dir}/${start_date}`, service.ssh_host)
			spin.succeed()
		}

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
