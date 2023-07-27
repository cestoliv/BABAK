// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import dotenv from 'dotenv'
import path from 'path'

$.verbose = false
dotenv.config()

export async function encrypt(systemConfig, file) {
	if (!process.env.hasOwnProperty("ENCRYPTION_KEY"))
		return file

	const enc_file = `${file}.enc`

	await $`openssl enc -aes-256-cbc -salt -pbkdf2 -in ${file} -out ${enc_file} -k ${process.env.ENCRYPTION_KEY}`
	await $`rm ${file}`

	return enc_file;
}
