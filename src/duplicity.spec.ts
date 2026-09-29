import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SystemConfig } from './config.ts';

const execMock =
    mock<(cmd: string[]) => Promise<void>>().mockResolvedValue(undefined);

mock.module('./utils.ts', () => ({
    exec: execMock,
    resolvePath: (p: string) => p,
    ensureDir: mock().mockResolvedValue(undefined),
    getDirectorySize: mock().mockResolvedValue('1G'),
}));

import { runDuplicity } from './duplicity.ts';

describe('runDuplicity', () => {
    const baseSystemConfig: SystemConfig = {
        backup_dir: './backups',
        temp_dir: '/tmp/babak',
    };

    beforeEach(() => {
        execMock.mockClear();
        delete process.env.GPG_KEY;
    });

    afterEach(() => {
        delete process.env.GPG_KEY;
    });

    test('runs duplicity with --no-encryption when no GPG key', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: baseSystemConfig,
        });

        expect(execMock).toHaveBeenCalledTimes(1);
        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd[0]).toBe('duplicity');
        expect(cmd).toContain('--no-encryption');
        expect(cmd).not.toContain('--encrypt-key');
        expect(cmd).toContain('/source');
        expect(cmd).toContain('file:///backup');
    });

    test('uses --encrypt-key when GPG key is configured', async () => {
        const config: SystemConfig = {
            ...baseSystemConfig,
            gpg_key: 'ABCDEF',
        };

        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: config,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--encrypt-key');
        expect(cmd).toContain('ABCDEF');
        expect(cmd).toContain('--gpg-options=--always-trust');
        expect(cmd).not.toContain('--no-encryption');
    });

    test('uses GPG_KEY from env when config has no key', async () => {
        process.env.GPG_KEY = 'ENV_GPG';

        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: baseSystemConfig,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--encrypt-key');
        expect(cmd).toContain('ENV_GPG');
    });

    test('includes --full-if-older-than with default 1M', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: baseSystemConfig,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--full-if-older-than=1M');
    });

    test('uses custom full_if_older_than from config', async () => {
        const config: SystemConfig = {
            ...baseSystemConfig,
            duplicity: {
                allow_source_mismatch: true,
                full_if_older_than: '2W',
            },
        };

        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: config,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--full-if-older-than=2W');
    });

    test('includes --allow-source-mismatch by default', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: baseSystemConfig,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--allow-source-mismatch');
    });

    test('omits --allow-source-mismatch when disabled', async () => {
        const config: SystemConfig = {
            ...baseSystemConfig,
            duplicity: {
                allow_source_mismatch: false,
                full_if_older_than: '1M',
            },
        };

        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            systemConfig: config,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).not.toContain('--allow-source-mismatch');
    });

    test('adds include paths relative to sourceDir', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            include: ['data', 'config'],
            systemConfig: baseSystemConfig,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--include');
        expect(cmd).toContain('/source/data');
        expect(cmd).toContain('/source/config');
        // When includes are specified, everything else should be excluded
        expect(cmd).toContain('**');
    });

    test('adds exclude paths relative to sourceDir', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            exclude: ['logs', 'tmp'],
            systemConfig: baseSystemConfig,
        });

        const cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('--exclude');
        expect(cmd).toContain('/source/logs');
        expect(cmd).toContain('/source/tmp');
    });

    test('adds catch-all exclude ** only when includes are provided', async () => {
        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            include: ['important'],
            systemConfig: baseSystemConfig,
        });
        let cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).toContain('**');

        execMock.mockClear();

        await runDuplicity({
            sourceDir: '/source',
            backupDir: '/backup',
            include: [],
            systemConfig: baseSystemConfig,
        });
        cmd = execMock.mock.calls[0]?.[0] as string[];
        expect(cmd).not.toContain('**');
    });

    test('propagates exec errors', async () => {
        execMock.mockRejectedValueOnce(new Error('exec failed'));

        await expect(
            runDuplicity({
                sourceDir: '/source',
                backupDir: '/backup',
                systemConfig: baseSystemConfig,
            }),
        ).rejects.toThrow('exec failed');
    });
});
