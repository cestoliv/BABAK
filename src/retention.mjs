// <reference 'zx/globals' />
// <reference 'zx/experimental' />

import { DateTime } from 'luxon'

$.verbose = false

/*
Backup retention:
	- today
	- yesterday
	- the day before yesterday
	- last week (the sunday)
	- two weeks before (the sunday)
	- three weeks before (the sunday)
*/

const today = DateTime.now()
const days_to_keep = [
	today, // Today
	today.minus({days: 1}), // Yesterday
	today.minus({days: 2}), // The day before yesterday
	today.set({ weekday: 7 }).minus({weeks: 1}), // Last sunday
	today.set({ weekday: 7 }).minus({weeks: 2}), // Two sunday before
	today.set({ weekday: 7 }).minus({weeks: 3}), // Three sunday before
]

export async function applyRetentionRules(directory_path) {
	const dir_backups = await glob(`${directory_path}/*.tar.bz2`)

	dir_backups.forEach(dir_backup => {
		const backup_date = dir_backup.split('/').pop().split('T')[0]
		let keep_backup = false

		days_to_keep.forEach(day_to_keep => {
			if (day_to_keep.toFormat('yyyy-LL-dd') == backup_date) {
				keep_backup = true
				return
			}
		})

		if (!keep_backup) {
			$`rm ${dir_backup}`
			console.log(chalk.yellow(`Backup of ${chalk.bold(backup_date)} deleted.`))
		}
	})
}
