// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { execNoShq } from './utils.mjs';

export async function duplicity({
	include, // Array of paths to include
	exclude, // Array of paths to exclude
	source_dir, // Directory to backup
	backup_dir, // Directory to put the backup
	allowSourceMismatch = false, // Allow source mismatch
	systemConfig, // System configuration
}) {
	const includeArg =
		include && include.length > 0
			? '--include ' +
			  include
					.map((file) => path.join(source_dir, file))
					.join(' --include ')
			: '';
	const excludeArg =
		exclude && exclude.length > 0
			? ' --exclude ' +
			  exclude
					.map((file) => {
						if (file === '**') {
							return "'**'";
						}
						return path.join(source_dir, file);
					})
					.join(' --exclude ')
			: '';

	// Check if there is already a full backup
	const do_full_backup = !(await fs.exists(backup_dir));

	const args = `${do_full_backup ? 'full' : 'incremental'} --encrypt-key ${
		systemConfig.gpg_key
	} --full-if-older-than 1M ${
		allowSourceMismatch ? '--allow-source-mismatch' : ''
	} ${includeArg} ${excludeArg} ${source_dir} file://${backup_dir}`;

	await execNoShq(`duplicity ${args}`);
}
