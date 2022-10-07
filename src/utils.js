import { resolve } from "path"

export function getSystemConfig(yamlConf) {
	let defaultConfig = {
		temp_dir: "/tmp",
		backup_dir: resolve("./backups"),
	}
	return Object.assign(defaultConfig, {
		...yamlConf,
		temp_dir: resolve(yamlConf.temp_dir),
		backup_dir: resolve(yamlConf.backup_dir),
	})
}
