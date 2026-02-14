import {
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from 'bun:test';
import type { LocalService, SystemConfig } from '../config.ts';

const runDuplicityMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const applyRetentionPolicyMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const ensureDirMock = mock<() => Promise<void>>().mockResolvedValue(undefined);
const getDirectorySizeMock =
    mock<() => Promise<string>>().mockResolvedValue('2.5G');

mock.module('../duplicity.ts', () => ({
    runDuplicity: runDuplicityMock,
}));

mock.module('../retention.ts', () => ({
    applyRetentionPolicy: applyRetentionPolicyMock,
}));

mock.module('../utils.ts', () => ({
    ensureDir: ensureDirMock,
    getDirectorySize: getDirectorySizeMock,
    resolvePath: (p: string) => `/resolved${p}`,
}));

import { runLocalBackup } from './local.ts';

describe('runLocalBackup', () => {
    const baseService: LocalService = {
        type: 'local',
        name: 'test-local',
        enabled: true,
        paths: ['/data/docs', '/data/photos'],
    };

    const baseConfig: SystemConfig = {
        backup_dir: './backups',
        temp_dir: '/tmp/babak',
    };

    let spawnSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        runDuplicityMock.mockClear();
        applyRetentionPolicyMock.mockClear();
        ensureDirMock.mockClear();
        getDirectorySizeMock.mockClear();
        runDuplicityMock.mockResolvedValue(undefined);
        applyRetentionPolicyMock.mockResolvedValue(undefined);
        spawnSpy = spyOn(Bun, 'spawn').mockReturnValue({
            exited: Promise.resolve(0),
        } as ReturnType<typeof Bun.spawn>);
    });

    afterEach(() => {
        mock.restore();
    });

    describe('successful backup', () => {
        test('returns success with size', async () => {
            const result = await runLocalBackup(baseService, baseConfig);
            expect(result.success).toBe(true);
            expect(result.serviceName).toBe('test-local');
            expect(result.size).toBe('2.5G');
        });

        test('calls ensureDir, runDuplicity, getDirectorySize, applyRetentionPolicy', async () => {
            await runLocalBackup(baseService, baseConfig);
            expect(ensureDirMock).toHaveBeenCalled();
            expect(runDuplicityMock).toHaveBeenCalledTimes(1);
            expect(getDirectorySizeMock).toHaveBeenCalled();
            expect(applyRetentionPolicyMock).toHaveBeenCalledTimes(1);
        });

        test('passes correct options to runDuplicity', async () => {
            await runLocalBackup(baseService, baseConfig);
            const call = (runDuplicityMock.mock.calls[0] as unknown[])?.[0];
            expect(call).toMatchObject({
                sourceDir: '/',
                include: ['/data/docs', '/data/photos'],
                exclude: [],
                systemConfig: baseConfig,
            });
        });

        test('includes startTime and endTime in result', async () => {
            const result = await runLocalBackup(baseService, baseConfig);
            expect(result.startTime).toBeDefined();
            expect(result.endTime).toBeDefined();
        });
    });

    describe('pre_command and post_command', () => {
        test('executes pre_command before backup', async () => {
            const service = { ...baseService, pre_command: 'echo pre' };
            const result = await runLocalBackup(service, baseConfig);
            expect(result.success).toBe(true);
            expect(spawnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    cmd: ['sh', '-c', 'echo pre'],
                }),
            );
        });

        test('executes post_command if pre_command ran', async () => {
            const service = {
                ...baseService,
                pre_command: 'echo pre',
                post_command: 'echo post',
            };
            await runLocalBackup(service, baseConfig);
            expect(spawnSpy).toHaveBeenCalledTimes(2);
            expect(spawnSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    cmd: ['sh', '-c', 'echo post'],
                }),
            );
        });

        test('does NOT execute post_command if no pre_command', async () => {
            const service = { ...baseService, post_command: 'echo post' };
            await runLocalBackup(service, baseConfig);
            expect(spawnSpy).not.toHaveBeenCalled();
        });

        test('runs post_command even if backup fails', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('backup failed'));
            const service = {
                ...baseService,
                pre_command: 'echo pre',
                post_command: 'echo post',
            };

            const result = await runLocalBackup(service, baseConfig);
            expect(result.success).toBe(false);
            expect(spawnSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('pre_command failure', () => {
        test('returns failure when pre_command exits non-zero', async () => {
            spawnSpy.mockReturnValue({
                exited: Promise.resolve(1),
            } as ReturnType<typeof Bun.spawn>);

            const service = { ...baseService, pre_command: 'false' };
            const result = await runLocalBackup(service, baseConfig);

            expect(result.success).toBe(false);
            expect(result.error).toContain('pre_command failed');
            expect(runDuplicityMock).not.toHaveBeenCalled();
        });
    });

    describe('backup failure', () => {
        test('returns failure when runDuplicity throws', async () => {
            runDuplicityMock.mockRejectedValueOnce(
                new Error('duplicity error'),
            );

            const result = await runLocalBackup(baseService, baseConfig);
            expect(result.success).toBe(false);
            expect(result.error).toBe('duplicity error');
        });

        test('does NOT apply retention when backup fails', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));
            await runLocalBackup(baseService, baseConfig);
            expect(applyRetentionPolicyMock).not.toHaveBeenCalled();
        });
    });

    describe('retention failure', () => {
        test('returns success with retentionError when retention fails', async () => {
            applyRetentionPolicyMock.mockRejectedValueOnce(
                new Error('retention failed'),
            );

            const result = await runLocalBackup(baseService, baseConfig);
            expect(result.success).toBe(true);
            expect(result.retentionError).toBe('retention failed');
        });
    });
});
