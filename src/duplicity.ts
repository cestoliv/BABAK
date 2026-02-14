import path from 'node:path';
import type { SystemConfig } from './config.ts';
import { getGPGKey } from './encryption.ts';
import { info } from './log.ts';
import { exec } from './utils.ts';

export interface DuplicityOptions {
    sourceDir: string; // Directory to backup
    backupDir: string; // Duplicity backup target (file://)
    include?: string[]; // Paths to include (relative to sourceDir)
    exclude?: string[]; // Paths to exclude
    systemConfig: SystemConfig; // System config (GPG key, duplicity options)
}

/**
 * Run Duplicity backup.
 * Reads GPG key and duplicity options from systemConfig.
 */
export const runDuplicity = async (
    options: DuplicityOptions,
): Promise<void> => {
    const {
        sourceDir,
        backupDir,
        include = [],
        exclude = [],
        systemConfig,
    } = options;
    const gpgKey = getGPGKey(systemConfig);

    const fullIfOlderThan = systemConfig?.duplicity?.full_if_older_than ?? '1M';
    const allowSourceMismatch =
        systemConfig?.duplicity?.allow_source_mismatch ?? true;

    // Build include arguments (relative to sourceDir)
    const includeArgs: string[] = [];
    for (const p of include) {
        includeArgs.push('--include', path.join(sourceDir, p));
    }

    // Build exclude arguments
    const excludeArgs: string[] = [];
    for (const p of exclude) {
        excludeArgs.push('--exclude', path.join(sourceDir, p));
    }

    // If we have includes, exclude everything else
    if (include.length > 0) {
        excludeArgs.push('--exclude', '**');
    }

    // Build the Duplicity command
    const cmd = [
        'duplicity',
        ...(gpgKey
            ? ['--encrypt-key', gpgKey, '--gpg-options=--always-trust']
            : ['--no-encryption']),
        `--full-if-older-than=${fullIfOlderThan}`,
        ...(allowSourceMismatch ? ['--allow-source-mismatch'] : []),
        ...includeArgs,
        ...excludeArgs,
        sourceDir,
        `file://${backupDir}`,
    ];

    info(`Running Duplicity: ${cmd.join(' ')}`);
    await exec(cmd);
};
