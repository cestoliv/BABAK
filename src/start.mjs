#!/usr/bin/env zx
// <reference 'zx/globals' />
// <reference 'zx/experimental' />

const log = require('why-is-node-running')

import moment from 'moment'

import { Matrix } from './matrix.mjs'
import { runSSH } from './ssh.mjs'
import { runWordpressFtp } from './wordpress_ftp.mjs'

const configFile = fs.readFileSync('./config.yml', 'utf8')
const config = YAML.parse(configFile)

let message = ''

for (let s = 0; s < config.services.length; s++) {
	const	service = config.services[s]

	message +=  message == '' ? '' : '\n'
	if (service.type == "ssh")
		message += await runSSH(service)
	else if (service.type == "wordpress_ftp")
		message += await runWordpressFtp(service)
	else
		console.error(chalk.red(`${chalk.bold(service.type)} type not supported.`))
}

message = `🕐 ${moment().format("ddd DD MMMM YYYY")}\n\n${message}\n\n😉, Hypolite`

console.log(`\n${chalk.green("message:")}\n${message}`)

if (config.hasOwnProperty("matrix")) {
	let matrix = new Matrix(config.matrix.url, config.matrix.user, config.matrix.token)
	await matrix.connect()
	await matrix.sendMessage(config.matrix.roomID, message)
	matrix.disconnect()
	console.log(chalk.green("sent with Matrix"))
}

process.exit()
