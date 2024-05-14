// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { resolve } from 'path';

export function getSystemConfig(yamlConf) {
	let defaultConfig = {
		temp_dir: '/tmp/babak',
		backup_dir: resolve('./backups'),
	};
	return Object.assign(defaultConfig, {
		...yamlConf,
		temp_dir: resolve(yamlConf.temp_dir),
		backup_dir: resolve(yamlConf.backup_dir),
	});
}

export async function execNoShq(cmd) {
	const q = $.quote;
	$.quote = (v) => v;
	const result = await $`${cmd}`;
	$.quote = q;
	return result;
}
