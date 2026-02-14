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
 * 2. Mount remote directory via SSHFS
 * 3. Run Duplicity backup
 * 4. Unmount
 * 5. Execute post_command on remote server (always runs if pre_command ran)
 * 6. Apply retention policy
 */
export const runSSHBackup = async (
    service: SSHService,
    systemConfig: SystemConfig,
): Promise<BackupResult> => {
    const startTime = DateTime.now();
    const mountDir = path.join(
        resolvePath(systemConfig.temp_dir),
        'mount',
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

        // Mount via SSHFS
        info(
            `[${service.name}] Mounting ${service.host.name}:${service.host.path}`,
        );
        await ensureDir(mountDir);
        await exec([
            'sshfs',
            `${service.host.name}:${service.host.path}`,
            mountDir,
        ]);

        // Run Duplicity
        info(`[${service.name}] Running backup via Duplicity`);
        await ensureDir(backupDir);
        await runDuplicity({
            sourceDir: mountDir,
            backupDir,
            include: service.storage,
            exclude: service.exclude || [],
            systemConfig,
        });

        // Unmount
        info(`[${service.name}] Unmounting`);
        await exec(['umount', mountDir]);

        backupSuccess = true;
        size = await getDirectorySize(backupDir);
    } catch (err) {
        // Ensure unmount on error
        try {
            await exec(['umount', mountDir]);
        } catch (unmountErr) {
            warn(
                `[${service.name}] Failed to unmount ${mountDir}:`,
                unmountErr instanceof Error
                    ? unmountErr.message
                    : String(unmountErr),
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
