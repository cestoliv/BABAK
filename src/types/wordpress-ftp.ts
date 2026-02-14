import path from 'node:path';
import { Client as FTPClient } from 'basic-ftp';
import { DateTime } from 'luxon';
import type { SystemConfig, WordPressFTPService } from '../config.ts';
import { runDuplicity } from '../duplicity.ts';
import { info, error as logError, warn } from '../log.ts';
import { applyRetentionPolicy } from '../retention.ts';
import { ensureDir, getDirectorySize, resolvePath } from '../utils.ts';
import type { BackupResult } from './base.ts';

const HTA_BLOCK_SQL = `
# BEGIN BlockSQLDownload
<Files ~ "\\.sql$">
Order allow,deny
Deny from all
</Files>
# END BlockSQLDownload`;

/**
 * Run WordPress FTP backup:
 * 1. Connect to FTP
 * 2. Download and modify .htaccess to block SQL access
 * 3. Upload PHP script to create database dump
 * 4. Trigger script via HTTP
 * 5. Wait for db.sql to appear and stabilize
 * 6. Download entire site to temp directory
 * 7. Cleanup remote files (restore .htaccess, remove scripts)
 * 8. Run Duplicity on temp directory
 * 9. Cleanup temp directory
 * 10. Apply retention policy
 */
export const runWordPressFTPBackup = async (
    service: WordPressFTPService,
    systemConfig: SystemConfig,
): Promise<BackupResult> => {
    const startTime = DateTime.now();
    const timestamp = startTime.toFormat("yyyy-LL-dd'T'HH-mm-ss");
    const tempDir = resolvePath(
        path.join(systemConfig.temp_dir, service.name, timestamp),
    );
    const backupDir = resolvePath(
        path.join(systemConfig.backup_dir, service.name),
    );

    const client = new FTPClient();
    client.ftp.verbose = false;

    let originalHtaccess = '';
    let retentionError: string | undefined;

    try {
        // Connect to FTP
        info(`[${service.name}] Connecting to FTP`);
        await client.access({
            host: service.ftp.host,
            user: service.ftp.user,
            password: service.ftp.password,
            secure: service.ftp.secure,
        });
        await client.cd(service.ftp.dir);

        await ensureDir(tempDir);

        // Download and modify .htaccess
        info(`[${service.name}] Securing SQL dump access`);
        const htaccessPath = path.join(tempDir, '.htaccess');
        try {
            await client.downloadTo(htaccessPath, '.htaccess');
        } catch (_err) {
            // .htaccess might not exist, create empty one
            await Bun.write(htaccessPath, '');
        }

        let htaccess = await Bun.file(htaccessPath).text();
        originalHtaccess = htaccess;

        if (!htaccess.includes(HTA_BLOCK_SQL)) {
            htaccess += HTA_BLOCK_SQL;
        }
        await Bun.write(htaccessPath, htaccess);
        await client.uploadFrom(htaccessPath, '.htaccess');

        // Create dump script
        info(`[${service.name}] Creating database dump script`);
        const dumpScript = `<?php
system("mysqldump --host=${service.database.host} --user=${service.database.user} --password=${service.database.password} ${service.database.name} > db.sql");
echo "started";
?>`;
        const dumpScriptPath = path.join(tempDir, 'db-dump.php');
        await Bun.write(dumpScriptPath, dumpScript);
        await client.uploadFrom(dumpScriptPath, 'db-dump.php');

        // Trigger dump creation
        info(`[${service.name}] Creating database dump`);
        const dumpUrl = `${service.host_url}/db-dump.php`;
        const dumpResponse = await fetch(dumpUrl, {
            signal: AbortSignal.timeout(60_000),
        });
        if (!dumpResponse.ok) {
            throw new Error(
                `Failed to trigger database dump: HTTP ${dumpResponse.status} ${dumpResponse.statusText}`,
            );
        }
        const dumpBody = await dumpResponse.text();
        if (!dumpBody.includes('started')) {
            throw new Error(
                `Database dump script did not execute correctly (possible PHP misconfiguration). Response: ${dumpBody.substring(0, 200)}`,
            );
        }

        // Wait for dump to exist and stabilize
        info(`[${service.name}] Waiting for database dump to complete`);
        let dumpReady = false;
        let attempts = 0;
        const maxAttempts = 40; // 10 minutes max
        let lastSize = -1;

        while (!dumpReady && attempts < maxAttempts) {
            const files = await client.list();
            const dumpFile = files.find((f) => f.name === 'db.sql');
            if (dumpFile && dumpFile.size > 0) {
                if (dumpFile.size === lastSize) {
                    // Size is stable across two consecutive polls — dump is complete
                    dumpReady = true;
                } else {
                    lastSize = dumpFile.size;
                }
            }
            if (!dumpReady) {
                await Bun.sleep(15000); // 15 seconds
                attempts++;
            }
        }

        if (!dumpReady) {
            throw new Error(
                'Database dump timeout: db.sql not ready after 10 minutes',
            );
        }

        // Download everything
        info(`[${service.name}] Downloading site files`);
        await client.downloadToDir(tempDir);

        // Clean up remote
        info(`[${service.name}] Cleaning up remote files`);
        try {
            await client.remove('db-dump.php');
        } catch (_err) {
            // Ignore if already removed
        }
        try {
            await client.remove('db.sql');
        } catch (_err) {
            // Ignore if already removed
        }

        // Restore .htaccess
        await Bun.write(htaccessPath, originalHtaccess);
        await client.uploadFrom(htaccessPath, '.htaccess');

        client.close();

        // Run Duplicity on downloaded files
        info(`[${service.name}] Running backup via Duplicity`);
        await ensureDir(backupDir);
        await runDuplicity({
            sourceDir: tempDir,
            backupDir,
            include: [], // Include everything
            exclude: [],
            systemConfig,
        });

        // Clean up temp
        info(`[${service.name}] Cleaning up temp directory`);
        await Bun.$`rm -rf ${tempDir}`.quiet();

        // Retention
        try {
            info(`[${service.name}] Applying retention policy`);
            await applyRetentionPolicy(backupDir, systemConfig);
        } catch (err) {
            retentionError = err instanceof Error ? err.message : String(err);
            logError(
                `[${service.name}] Retention policy failed: ${retentionError}`,
            );
        }

        const size = await getDirectorySize(backupDir);
        return {
            success: true,
            serviceName: service.name,
            size,
            retentionError,
            startTime,
            endTime: DateTime.now(),
        };
    } catch (err) {
        // Attempt to clean up remote files before closing
        try {
            await client.remove('db-dump.php');
        } catch (cleanupErr) {
            warn(
                `[${service.name}] Failed to remove db-dump.php:`,
                cleanupErr instanceof Error
                    ? cleanupErr.message
                    : String(cleanupErr),
            );
        }
        try {
            await client.remove('db.sql');
        } catch (cleanupErr) {
            warn(
                `[${service.name}] Failed to remove db.sql:`,
                cleanupErr instanceof Error
                    ? cleanupErr.message
                    : String(cleanupErr),
            );
        }
        // Restore original .htaccess if we modified it
        if (originalHtaccess) {
            try {
                const htaccessPath = path.join(tempDir, '.htaccess');
                await Bun.write(htaccessPath, originalHtaccess);
                await client.uploadFrom(htaccessPath, '.htaccess');
            } catch (cleanupErr) {
                warn(
                    `[${service.name}] Failed to restore .htaccess:`,
                    cleanupErr instanceof Error
                        ? cleanupErr.message
                        : String(cleanupErr),
                );
            }
        }

        client.close();

        // Clean up temp on error
        try {
            await Bun.$`rm -rf ${tempDir}`.quiet();
        } catch (_cleanupErr) {
            // Ignore cleanup errors
        }

        const errorMsg = err instanceof Error ? err.message : String(err);
        logError(`[${service.name}] Backup failed: ${errorMsg}`);
        return {
            success: false,
            serviceName: service.name,
            error: errorMsg,
            startTime,
            endTime: DateTime.now(),
        };
    }
};
