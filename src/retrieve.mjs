// <reference 'zx/globals' />
// <reference 'zx/experimental' />

$.verbose = false

export async function retrieve(retrs, dir, ssh_host) {
	for (const retr of retrs) {
		let backup_path = `${dir}/${retr.backup_dir}`
		await $`mkdir -p ${backup_path}`

		let rsync_args = []
		rsync_args.push(`-a`)
		for (const path of retr.paths) {
			if (retr.host)
				rsync_args.push(`${retr.host}:${path}`)
			else
				rsync_args.push(`${ssh_host}:${path}`)
		}
		rsync_args.push(backup_path)

		if (retr.rsync_path == "")
			await $`rsync ${rsync_args}`
		else
			await $`rsync --rsync-path=${retr.rsync_path} ${rsync_args}`
	}
}
