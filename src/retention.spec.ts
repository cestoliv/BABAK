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

import { applyRetentionPolicy } from './retention.ts';

describe('applyRetentionPolicy', () => {
    const baseConfig: SystemConfig = {
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

    test('runs two duplicity commands', async () => {
        await applyRetentionPolicy('/backup/svc', baseConfig);
        expect(execMock).toHaveBeenCalledTimes(2);
    });

    test('uses default retention values when not configured', async () => {
        await applyRetentionPolicy('/backup/svc', baseConfig);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        expect(firstCmd).toContain('remove-older-than');
        expect(firstCmd).toContain('6M');

        const secondCmd = execMock.mock.calls[1]?.[0] as string[];
        expect(secondCmd).toContain('remove-all-inc-of-but-n-full');
        expect(secondCmd).toContain('1');
    });

    test('uses custom retention values from config', async () => {
        const config: SystemConfig = {
            ...baseConfig,
            retention: {
                full_backup_lifetime: '12M',
                incremental_lifetime: '3M',
                keep_full_chains: 3,
            },
        };

        await applyRetentionPolicy('/backup/svc', config);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        expect(firstCmd).toContain('12M');

        const secondCmd = execMock.mock.calls[1]?.[0] as string[];
        expect(secondCmd).toContain('3');
    });

    test('includes --no-encryption when no GPG key', async () => {
        await applyRetentionPolicy('/backup/svc', baseConfig);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        expect(firstCmd).toContain('--no-encryption');
        expect(firstCmd).not.toContain('--encrypt-key');

        const secondCmd = execMock.mock.calls[1]?.[0] as string[];
        expect(secondCmd).toContain('--no-encryption');
    });

    test('includes --encrypt-key when GPG key is configured', async () => {
        const config: SystemConfig = {
            ...baseConfig,
            gpg_key: 'MYKEY',
        };

        await applyRetentionPolicy('/backup/svc', config);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        expect(firstCmd).toContain('--encrypt-key');
        expect(firstCmd).toContain('MYKEY');
        expect(firstCmd).toContain('--gpg-options=--always-trust');
    });

    test('includes --force flag in both commands', async () => {
        await applyRetentionPolicy('/backup/svc', baseConfig);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        const secondCmd = execMock.mock.calls[1]?.[0] as string[];
        expect(firstCmd).toContain('--force');
        expect(secondCmd).toContain('--force');
    });

    test('uses file:// prefix for backup dir in both commands', async () => {
        await applyRetentionPolicy('/backup/svc', baseConfig);

        const firstCmd = execMock.mock.calls[0]?.[0] as string[];
        const secondCmd = execMock.mock.calls[1]?.[0] as string[];
        expect(firstCmd).toContain('file:///backup/svc');
        expect(secondCmd).toContain('file:///backup/svc');
    });

    test('propagates exec errors', async () => {
        execMock.mockRejectedValueOnce(new Error('duplicity failed'));

        await expect(
            applyRetentionPolicy('/backup/svc', baseConfig),
        ).rejects.toThrow('duplicity failed');
    });
});
