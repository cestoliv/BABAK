import { parseArgs } from 'node:util';
import { DateTime } from 'luxon';
import { parse } from 'yaml';
import { filterServices, parseConfig } from './src/config.ts';
import { isEncryptionEnabled } from './src/encryption.ts';
import { info, error as logError, warn } from './src/log.ts';
import {
    formatBackupSummary,
    type NtfyConfig,
    sendNotification,
    sendServiceFailureNotification,
} from './src/notifications.ts';
import type { BackupResult } from './src/types/base.ts';
import { runLocalBackup } from './src/types/local.ts';
import { runSSHBackup } from './src/types/ssh.ts';
import { runWordPressFTPBackup } from './src/types/wordpress-ftp.ts';

const { values: args, positionals: serviceFilter } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
        config: { type: 'string', short: 'c' },
    },
    strict: false,
    allowPositionals: true,
});

const configPath = typeof args.config === 'string' ? args.config : undefined;

const main = async () => {
    const startTime = DateTime.now();
    const config = await parseConfig(configPath);
    const servicesToRun = filterServices(config.services, serviceFilter);
    const results: BackupResult[] = [];

    info('Starting Babak backup system');
    if (serviceFilter.length > 0) {
        info(
            `Running only specified services: ${serviceFilter.map((n) => `"${n}"`).join(', ')}`,
        );
    }

    // Apply system config defaults
    const systemConfig = {
        backup_dir: config.system?.backup_dir || './backups',
        temp_dir: config.system?.temp_dir || '/tmp/babak',
        gpg_key: config.system?.gpg_key,
        ntfy: config.system?.ntfy,
        retention: config.system?.retention,
        duplicity: config.system?.duplicity,
    };

    // Check encryption
    if (!isEncryptionEnabled(systemConfig)) {
        warn('No GPG key configured, backups will not be encrypted');
    }

    // Run backups for each service
    for (const service of servicesToRun) {
        try {
            info(`[${service.name}] Starting ${service.type} backup`);

            let result: BackupResult;
            switch (service.type) {
                case 'ssh':
                    result = await runSSHBackup(service, systemConfig);
                    break;
                case 'local':
                    result = await runLocalBackup(service, systemConfig);
                    break;
                case 'wordpress_ftp':
                    result = await runWordPressFTPBackup(service, systemConfig);
                    break;
                default: {
                    const _exhaustive: never = service;
                    throw new Error(
                        `Unknown service type: ${(_exhaustive as { type: string }).type}`,
                    );
                }
            }

            results.push(result);
            if (result.success) {
                info(`[${service.name}] ✅ Complete (${result.size})`);
            } else {
                logError(`[${service.name}] ❌ Failed`);
                if (systemConfig.ntfy) {
                    await sendServiceFailureNotification(
                        systemConfig.ntfy,
                        service.name,
                        result.error || 'Unknown error',
                    );
                }
            }
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            logError(`[${service.name}] ❌ Failed:`, errorMsg);
            results.push({
                success: false,
                serviceName: service.name,
                error: errorMsg,
                startTime,
                endTime: DateTime.now(),
            });
            if (systemConfig.ntfy) {
                await sendServiceFailureNotification(
                    systemConfig.ntfy,
                    service.name,
                    errorMsg,
                );
            }
        }
    }

    // Send notification
    if (systemConfig.ntfy) {
        try {
            const summary = formatBackupSummary(results, startTime);
            const allSuccess = results.every((r) => r.success);
            const hasRetentionWarnings = results.some((r) => r.retentionError);

            let title: string;
            if (!allSuccess) {
                title = 'Backup Completed with Errors';
            } else if (hasRetentionWarnings) {
                title = 'Backup Complete (Retention Warnings)';
            } else {
                title = 'Backup Complete';
            }

            await sendNotification(systemConfig.ntfy, {
                title,
                message: summary,
                priority:
                    allSuccess && !hasRetentionWarnings ? 'default' : 'high',
                tags: allSuccess
                    ? ['backup', 'success']
                    : ['backup', 'warning'],
            });
        } catch (err) {
            logError('Failed to send notification:', err);
        }
    }

    info('Babak backup complete');
    process.exit(results.every((r) => r.success) ? 0 : 1);
};

main().catch(async (err) => {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logError('Fatal error in Babak:', errorMsg);

    // Attempt to send a fatal error notification
    try {
        const configFile = Bun.file(
            configPath ?? `${process.cwd()}/config.yml`,
        );
        if (await configFile.exists()) {
            const raw = parse(await configFile.text()) as Record<
                string,
                unknown
            >;
            const system = raw?.system as Record<string, unknown> | undefined;
            const ntfy = system?.ntfy as NtfyConfig | undefined;
            if (ntfy?.url && ntfy?.topic) {
                await sendServiceFailureNotification(ntfy, 'FATAL', errorMsg);
            }
        }
    } catch (_notifyErr) {
        // Best-effort — don't mask the original error
    }

    process.exit(2);
});
