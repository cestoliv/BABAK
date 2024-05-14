// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon';
import ora from 'ora';

import { execNoShq } from '../utils.mjs';
import { duplicity } from '../duplicity.mjs';

$.verbose = false;

export async function runSSH(systemConfig, service) {
	const start_date = DateTime.now().toFormat("yyyy-LL-dd'T'HH-mm-ss");
	var spin = undefined;

	console.log(`${chalk.blue(`${chalk.bold(service.name)} (${start_date})`)}`);

	const temp_dir = path.join(
		systemConfig.temp_dir,
		service.backup_dir,
		start_date,
	);
	const mount_dir = path.join(
		systemConfig.temp_dir,
		'mount',
		service.backup_dir,
	);
	// const backup_dir = path.join(systemConfig.backup_dir, service.backup_dir, start_date)
	const backup_dir = path.join(systemConfig.backup_dir, service.backup_dir);

	try {
		// Create dir
		await $`mkdir -p ${temp_dir}`;

		// Run before command
		if (
			service.commands &&
			service.commands.before != undefined &&
			service.commands.before != ''
		) {
			spin = ora('Running "before" command on server').start();
			await $`ssh ${service.ssh_host} ${service.commands.before}`;
			spin.succeed();
		}

		// Download backup
		if (service.retrieve) {
			spin = ora('Downloading backup').start();

			// Mount the host using sshfs
			await $`mkdir -p ${mount_dir}`;
			await $`sshfs ${service.ssh_host}:/ ${mount_dir}`;

			await duplicity({
				include: service.retrieve.paths,
				exclude: ['**'],
				source_dir: mount_dir,
				backup_dir,
				systemConfig,
			});

			// Unmount the host
			await $`umount ${mount_dir}`;
			spin.succeed();
		}

		// Run after command
		if (
			service.commands &&
			service.commands.after != undefined &&
			service.commands.after != ''
		) {
			spin = ora('Running "after" command on server').start();
			await $`ssh ${service.ssh_host} ${service.commands.after}`;
			spin.succeed();
		}

		// Delete downloaded
		await $`rm -rf ${path.join(temp_dir, '..')}`;

		// Get archive size
		let archive_size =
			await $`du -h ${backup_dir} | cut -f 1 | tr '\n' ' ' | sed '$s/ $//'`;
		spin.succeed();

		console.log(chalk.green('done'));
		return `✅  ${service.name} (${archive_size})`;
	} catch (err) {
		if (spin) spin.fail();
		return `❌  ${service.name} (${err.toString().replace(/\n/g, '')})`;
	}
}
