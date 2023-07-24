// <reference 'zx/globals' />
// <reference 'zx/experimental' />

var path = require('path')

$.verbose = false

export async function encrypt(systemConfig, file) {
	if (!systemConfig.encryption)
		return file;
	if (!systemConfig.encryption.key)
		return file;

	const enc_file = `${file}.enc`

	await $`openssl enc -aes-256-cbc -salt -pbkdf2 -in ${file} -out ${enc_file} -k ${systemConfig.encryption.key}`
	await $`rm ${file}`

	return enc_file;
}
