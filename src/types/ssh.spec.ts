import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { SSHService, SystemConfig } from '../config.ts';

const execMock =
    mock<(cmd: string[]) => Promise<void>>().mockResolvedValue(undefined);
const runDuplicityMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const applyRetentionPolicyMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const ensureDirMock = mock<() => Promise<void>>().mockResolvedValue(undefined);
const getDirectorySizeMock =
    mock<() => Promise<string>>().mockResolvedValue('3G');

mock.module('../utils.ts', () => ({
    exec: execMock,
    ensureDir: ensureDirMock,
    getDirectorySize: getDirectorySizeMock,
    resolvePath: (p: string) => `/resolved${p}`,
}));

mock.module('../duplicity.ts', () => ({
    runDuplicity: runDuplicityMock,
}));

mock.module('../retention.ts', () => ({
    applyRetentionPolicy: applyRetentionPolicyMock,
}));

import { runSSHBackup } from './ssh.ts';

describe('runSSHBackup', () => {
    const baseService: SSHService = {
        type: 'ssh',
        name: 'test-ssh',
        enabled: true,
        host: { name: 'myserver', path: '/data' },
    };

    const baseConfig: SystemConfig = {
        backup_dir: './backups',
        temp_dir: '/tmp/babak',
    };

    beforeEach(() => {
        execMock.mockClear();
        runDuplicityMock.mockClear();
        applyRetentionPolicyMock.mockClear();
        ensureDirMock.mockClear();
        getDirectorySizeMock.mockClear();
        execMock.mockResolvedValue(undefined);
        runDuplicityMock.mockResolvedValue(undefined);
        applyRetentionPolicyMock.mockResolvedValue(undefined);
    });

    afterEach(() => {
        mock.restore();
    });

    describe('successful backup', () => {
        test('returns success with size', async () => {
            const result = await runSSHBackup(baseService, baseConfig);
            expect(result.success).toBe(true);
            expect(result.size).toBe('3G');
        });

        test('mounts via sshfs, runs duplicity, unmounts, applies retention', async () => {
            await runSSHBackup(baseService, baseConfig);

            const calls = execMock.mock.calls.map((c) => (c[0] as string[])[0]);
            expect(calls).toContain('sshfs');
            expect(calls).toContain('umount');
            expect(runDuplicityMock).toHaveBeenCalledTimes(1);
            expect(applyRetentionPolicyMock).toHaveBeenCalledTimes(1);
        });

        test('mounts remote path correctly', async () => {
            await runSSHBackup(baseService, baseConfig);

            const sshfsCall = execMock.mock.calls.find(
                (c) => (c[0] as string[])[0] === 'sshfs',
            );
            expect(sshfsCall).toBeDefined();
            expect((sshfsCall?.[0] as string[])[1]).toBe('myserver:/data');
        });
    });

    describe('pre_command and post_command', () => {
        test('runs pre_command via ssh before mount', async () => {
            const service = {
                ...baseService,
                pre_command: 'pg_dump > dump.sql',
            };
            await runSSHBackup(service, baseConfig);

            const firstCall = execMock.mock.calls[0]?.[0] as string[];
            expect(firstCall).toContain('ssh');
            expect(firstCall).toContain('myserver');
            expect(firstCall.join(' ')).toContain('pg_dump > dump.sql');
        });

        test('runs post_command via ssh after backup', async () => {
            const service = {
                ...baseService,
                pre_command: 'echo pre',
                post_command: 'rm dump.sql',
            };
            await runSSHBackup(service, baseConfig);

            const postCall = execMock.mock.calls.find((c) =>
                (c[0] as string[]).join(' ').includes('rm dump.sql'),
            );
            expect(postCall).toBeDefined();
        });

        test('runs post_command even if backup fails', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));
            const service = {
                ...baseService,
                pre_command: 'echo pre',
                post_command: 'echo post',
            };

            await runSSHBackup(service, baseConfig);

            const postCall = execMock.mock.calls.find((c) =>
                (c[0] as string[]).join(' ').includes('echo post'),
            );
            expect(postCall).toBeDefined();
        });

        test('handles post_command failure gracefully', async () => {
            execMock.mockImplementation(async (cmd: string[]) => {
                if ((cmd as string[]).join(' ').includes('echo post')) {
                    throw new Error('post failed');
                }
            });
            const service = {
                ...baseService,
                pre_command: 'echo pre',
                post_command: 'echo post',
            };

            const result = await runSSHBackup(service, baseConfig);
            // Backup itself should succeed despite post_command failure
            expect(result.success).toBe(true);
        });

        test('does NOT run post_command if pre_command did not run', async () => {
            const service = { ...baseService, post_command: 'echo post' };
            await runSSHBackup(service, baseConfig);

            const postCall = execMock.mock.calls.find((c) =>
                (c[0] as string[]).join(' ').includes('echo post'),
            );
            expect(postCall).toBeUndefined();
        });
    });

    describe('failure paths', () => {
        test('attempts umount on backup error', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));

            const result = await runSSHBackup(baseService, baseConfig);
            expect(result.success).toBe(false);

            const umountCall = execMock.mock.calls.find(
                (c) => (c[0] as string[])[0] === 'umount',
            );
            expect(umountCall).toBeDefined();
        });

        test('handles umount failure gracefully in error path', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));
            execMock.mockImplementation(async (cmd: string[]) => {
                if (cmd[0] === 'umount') {
                    throw new Error('umount failed');
                }
            });

            const result = await runSSHBackup(baseService, baseConfig);
            expect(result.success).toBe(false);
            // Should not throw
        });

        test('does not apply retention when backup fails', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));
            await runSSHBackup(baseService, baseConfig);
            expect(applyRetentionPolicyMock).not.toHaveBeenCalled();
        });

        test('captures retention error without failing backup', async () => {
            applyRetentionPolicyMock.mockRejectedValueOnce(
                new Error('retention err'),
            );

            const result = await runSSHBackup(baseService, baseConfig);
            expect(result.success).toBe(true);
            expect(result.retentionError).toBe('retention err');
        });
    });

    describe('includes and excludes', () => {
        test('passes storage as include and exclude to runDuplicity', async () => {
            const service: SSHService = {
                ...baseService,
                storage: ['./data', './config'],
                exclude: ['*.log'],
            };

            await runSSHBackup(service, baseConfig);

            const call = (runDuplicityMock.mock.calls[0] as unknown[])?.[0];
            expect(call).toMatchObject({
                include: ['./data', './config'],
                exclude: ['*.log'],
            });
        });
    });
});
