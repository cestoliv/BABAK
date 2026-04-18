import path from 'node:path';
import { DateTime } from 'luxon';
import type { SSHService, SystemConfig } from '../config.ts';
import { runDuplicity } from '../duplicity.ts';
import { info, error as logError, warn } from '../log.ts';
import { applyRetentionPolicy } from '../retention.ts';
import { ensureDir, exec, getDirectorySize, resolvePath } from '../utils.ts';
import type { BackupResult } from './base.ts';

/**
 * Run SSH backup:
 * 1. Execute pre_command on remote server
 * 2. Copy files from remote via rsync
 * 3. Run Duplicity backup on local copy
 * 4. Clean up local copy
 * 5. Execute post_command on remote server (always runs if pre_command ran)
 * 6. Apply retention policy
 */
export const runSSHBackup = async (
    service: SSHService,
    systemConfig: SystemConfig,
): Promise<BackupResult> => {
    const startTime = DateTime.now();
    const localCopyDir = path.join(
        resolvePath(systemConfig.temp_dir),
        'copy',
        service.name,
    );
    const backupDir = resolvePath(
        path.join(systemConfig.backup_dir, service.name),
    );

    let preCommandRan = false;
    let backupSuccess = false;
    let backupError: string | undefined;
    let retentionError: string | undefined;
    let size: string | undefined;

    try {
        // Pre-command
        if (service.pre_command) {
            info(`[${service.name}] Running pre_command`);
            const preCmd = `cd ${service.host.path} && ${service.pre_command}`;
            await exec(['ssh', service.host.name, preCmd]);
            preCommandRan = true;
        }

        // Copy files from remote via rsync
        info(
            `[${service.name}] Copying files from ${service.host.name}:${service.host.path}`,
        );
        await ensureDir(localCopyDir);

        const rsyncExcludes: string[] = [];
        for (const ex of service.exclude || []) {
            rsyncExcludes.push('--exclude', ex);
        }

        for (const p of service.storage) {
            const cleanPath = p.replace(/^\.\//, '');
            const remoteSrc = `${service.host.name}:${service.host.path}/${cleanPath}`;
            const localDestParent = path.dirname(
                path.join(localCopyDir, cleanPath),
            );

            await ensureDir(localDestParent);
            await exec([
                'rsync',
                '-az',
                ...rsyncExcludes,
                remoteSrc,
                `${localDestParent}/`,
            ]);
        }

        // Run Duplicity on local copy
        info(`[${service.name}] Running backup via Duplicity`);
        await ensureDir(backupDir);
        await runDuplicity({
            sourceDir: localCopyDir,
            backupDir,
            systemConfig,
        });

        // Clean up local copy
        info(`[${service.name}] Cleaning up local copy`);
        await Bun.$`rm -rf ${localCopyDir}`.quiet();

        backupSuccess = true;
        size = await getDirectorySize(backupDir);
    } catch (err) {
        // Clean up local copy on error
        try {
            await Bun.$`rm -rf ${localCopyDir}`.quiet();
        } catch (cleanupErr) {
            warn(
                `[${service.name}] Failed to clean up ${localCopyDir}:`,
                cleanupErr instanceof Error
                    ? cleanupErr.message
                    : String(cleanupErr),
            );
        }

        backupError = err instanceof Error ? err.message : String(err);
        logError(`[${service.name}] Backup failed: ${backupError}`);
    } finally {
        // Post-command always runs if pre_command ran (cleanup e.g. removing DB dumps)
        if (preCommandRan && service.post_command) {
            try {
                info(`[${service.name}] Running post_command`);
                const postCmd = `cd ${service.host.path} && ${service.post_command}`;
                await exec(['ssh', service.host.name, postCmd]);
            } catch (err) {
                const postErr =
                    err instanceof Error ? err.message : String(err);
                logError(`[${service.name}] post_command failed: ${postErr}`);
            }
        }
    }

    // Retention (only if backup succeeded)
    if (backupSuccess) {
        try {
            info(`[${service.name}] Applying retention policy`);
            await applyRetentionPolicy(backupDir, systemConfig);
        } catch (err) {
            retentionError = err instanceof Error ? err.message : String(err);
            logError(
                `[${service.name}] Retention policy failed: ${retentionError}`,
            );
        }
    }

    return {
        success: backupSuccess,
        serviceName: service.name,
        size,
        error: backupError,
        retentionError,
        startTime,
        endTime: DateTime.now(),
    };
};
