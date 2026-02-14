import path from 'node:path';
import { DateTime } from 'luxon';
import type { LocalService, SystemConfig } from '../config.ts';
import { runDuplicity } from '../duplicity.ts';
import { info, error as logError } from '../log.ts';
import { applyRetentionPolicy } from '../retention.ts';
import { ensureDir, getDirectorySize, resolvePath } from '../utils.ts';
import type { BackupResult } from './base.ts';

/**
 * Run Local backup:
 * 1. Execute pre_command (if specified)
 * 2. Run Duplicity on local paths
 * 3. Execute post_command (if specified, always runs if pre_command ran)
 * 4. Apply retention policy
 */
export const runLocalBackup = async (
    service: LocalService,
    systemConfig: SystemConfig,
): Promise<BackupResult> => {
    const startTime = DateTime.now();
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
            const proc = Bun.spawn({
                cmd: ['sh', '-c', service.pre_command],
                stdout: 'inherit',
                stderr: 'inherit',
            });
            const exitCode = await proc.exited;
            if (exitCode !== 0) {
                throw new Error(
                    `pre_command failed with exit code ${exitCode}`,
                );
            }
            preCommandRan = true;
        }

        // Run Duplicity directly on local paths
        info(`[${service.name}] Running backup via Duplicity`);
        await ensureDir(backupDir);
        await runDuplicity({
            sourceDir: '/', // Root, but filter with includes
            backupDir,
            include: service.paths,
            exclude: service.exclude || [],
            systemConfig,
        });

        backupSuccess = true;
        size = await getDirectorySize(backupDir);
    } catch (err) {
        backupError = err instanceof Error ? err.message : String(err);
        logError(`[${service.name}] Backup failed: ${backupError}`);
    } finally {
        // Post-command always runs if pre_command ran (cleanup)
        if (preCommandRan && service.post_command) {
            try {
                info(`[${service.name}] Running post_command`);
                const proc = Bun.spawn({
                    cmd: ['sh', '-c', service.post_command],
                    stdout: 'inherit',
                    stderr: 'inherit',
                });
                const exitCode = await proc.exited;
                if (exitCode !== 0) {
                    logError(
                        `[${service.name}] post_command failed with exit code ${exitCode}`,
                    );
                }
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
