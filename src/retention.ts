import type { SystemConfig } from './config.ts';
import { getGPGKey } from './encryption.ts';
import { info } from './log.ts';
import { exec } from './utils.ts';

/**
 * Retention Strategy (Lazy Man's Backup Strategy):
 * - Daily incremental backups
 * - Monthly full backups
 * - Keep incremental backups for 1 month (daily granularity)
 * - Keep full backups for 6 months (monthly granularity)
 * - Keep only 1 complete full+incremental chain beyond 1 month
 *
 * This provides:
 * - Daily restore points for the past month
 * - Monthly restore points for 6 months total
 * - Efficient storage usage
 *
 * Reference: https://blog.yadutaf.fr/2012/09/08/lazy-man-backup-strategy-with-duplicity-part-1/
 */

interface RetentionConfig {
    fullBackupLifetime: string;
    incrementalLifetime: string;
    keepFullChains: number;
}

const DEFAULT_RETENTION: RetentionConfig = {
    fullBackupLifetime: '6M', // 6 months
    incrementalLifetime: '1M', // 1 month
    keepFullChains: 1, // Keep 1 full chain (for redundancy)
};

/**
 * Apply retention policy to a backup directory.
 * Reads GPG key and retention settings from systemConfig.
 */
export const applyRetentionPolicy = async (
    backupDir: string,
    systemConfig: SystemConfig,
): Promise<void> => {
    const gpgKey = getGPGKey(systemConfig);
    const retentionCfg = systemConfig.retention;
    const retention: RetentionConfig = {
        fullBackupLifetime:
            retentionCfg?.full_backup_lifetime ??
            DEFAULT_RETENTION.fullBackupLifetime,
        incrementalLifetime:
            retentionCfg?.incremental_lifetime ??
            DEFAULT_RETENTION.incrementalLifetime,
        keepFullChains:
            retentionCfg?.keep_full_chains ?? DEFAULT_RETENTION.keepFullChains,
    };

    info(
        `Applying retention policy: incremental=${retention.incrementalLifetime}, full=${retention.fullBackupLifetime}, chains=${retention.keepFullChains}`,
    );

    // Step 1: Remove full backups older than specified lifetime (default: 6 months)
    info(`Removing full backups older than ${retention.fullBackupLifetime}`);
    const removeFullCmd = [
        'duplicity',
        'remove-older-than',
        retention.fullBackupLifetime,
        '--force',
        ...(gpgKey
            ? ['--encrypt-key', gpgKey, '--gpg-options=--always-trust']
            : ['--no-encryption']),
        `file://${backupDir}`,
    ];
    await exec(removeFullCmd);

    // Step 2: Remove old incremental backups, keeping only recent daily history
    // This keeps incrementals for the specified period (default: 1 month)
    // and only monthly snapshots beyond that
    info(
        `Cleaning incremental backups older than ${retention.incrementalLifetime}`,
    );
    const removeIncCmd = [
        'duplicity',
        'remove-all-inc-of-but-n-full',
        retention.keepFullChains.toString(),
        '--force',
        ...(gpgKey
            ? ['--encrypt-key', gpgKey, '--gpg-options=--always-trust']
            : ['--no-encryption']),
        `file://${backupDir}`,
    ];
    await exec(removeIncCmd);

    info('Retention policy applied successfully');
};
