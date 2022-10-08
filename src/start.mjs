#!/usr/bin/env zx
// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'

import { Matrix } from './matrix.mjs'
import { runSSH } from './types/ssh.mjs'
import { runWordpressFtp } from './types/wordpress_ftp.mjs'
import { runLocal } from './types/local.mjs'
import { getSystemConfig } from './utils.js'

const configFile = fs.readFileSync('./config.yml', 'utf8')
const config = YAML.parse(configFile)

const systemConfig = getSystemConfig(config.system)

let message = ''

for (let s = 0; s < config.services.length; s++) {
	const	service = config.services[s]
	cd(path.join(__dirname, "../"))

	message +=  message == '' ? '' : '\n'
	if (service.type == "ssh")
		message += await runSSH(systemConfig, service)
	else if (service.type == "wordpress_ftp")
		message += await runWordpressFtp(systemConfig, service)
	else if (service.type == "local")
		message += await runLocal(systemConfig, service)
	else
		console.error(chalk.red(`${chalk.bold(service.type)} type not supported.`))
}

message = `🕐 ${DateTime.now().toFormat("ccc dd LLLL yyyy")}\n\n${message}\n\n😉, Hypolite`

console.log(`\n${chalk.green("message:")}\n${message}`)

if (config.hasOwnProperty("matrix")) {
	let matrix = new Matrix(config.matrix.url, config.matrix.user, config.matrix.token)
	await matrix.connect()
	await matrix.sendMessage(config.matrix.roomID, message)
	matrix.disconnect()
	console.log(chalk.green("sent with Matrix"))
}

// Delete temp dir
await $`rm -rf ${systemConfig.temp_dir}`

process.exit()
