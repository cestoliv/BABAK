import {
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from 'bun:test';
import type { SystemConfig, WordPressFTPService } from '../config.ts';

const runDuplicityMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const applyRetentionPolicyMock =
    mock<() => Promise<void>>().mockResolvedValue(undefined);
const ensureDirMock = mock<() => Promise<void>>().mockResolvedValue(undefined);
const getDirectorySizeMock =
    mock<() => Promise<string>>().mockResolvedValue('500M');

// FTP client mock
const mockFTPClient = {
    ftp: { verbose: false },
    access: mock<() => Promise<void>>().mockResolvedValue(undefined),
    cd: mock<() => Promise<void>>().mockResolvedValue(undefined),
    downloadTo: mock<() => Promise<void>>().mockResolvedValue(undefined),
    uploadFrom: mock<() => Promise<void>>().mockResolvedValue(undefined),
    downloadToDir: mock<() => Promise<void>>().mockResolvedValue(undefined),
    remove: mock<() => Promise<void>>().mockResolvedValue(undefined),
    list: mock<
        () => Promise<{ name: string; size: number }[]>
    >().mockResolvedValue([{ name: 'db.sql', size: 1000 }]),
    close: mock(() => {}),
};

mock.module('basic-ftp', () => ({
    Client: class {
        ftp = mockFTPClient.ftp;
        access = mockFTPClient.access;
        cd = mockFTPClient.cd;
        downloadTo = mockFTPClient.downloadTo;
        uploadFrom = mockFTPClient.uploadFrom;
        downloadToDir = mockFTPClient.downloadToDir;
        remove = mockFTPClient.remove;
        list = mockFTPClient.list;
        close = mockFTPClient.close;
    },
}));

mock.module('../duplicity.ts', () => ({
    runDuplicity: runDuplicityMock,
}));

mock.module('../retention.ts', () => ({
    applyRetentionPolicy: applyRetentionPolicyMock,
}));

mock.module('../utils.ts', () => ({
    ensureDir: ensureDirMock,
    getDirectorySize: getDirectorySizeMock,
    resolvePath: (p: string) => p,
}));

import { runWordPressFTPBackup } from './wordpress-ftp.ts';

describe('runWordPressFTPBackup', () => {
    const service: WordPressFTPService = {
        type: 'wordpress_ftp',
        name: 'wp-test',
        enabled: true,
        host_url: 'https://example.com',
        ftp: {
            host: 'ftp.example.com',
            user: 'ftpuser',
            password: 'ftppass',
            dir: '/public_html',
            secure: false,
        },
        database: {
            host: 'localhost',
            user: 'dbuser',
            password: 'dbpass',
            name: 'wordpress',
        },
    };

    const config: SystemConfig = {
        backup_dir: './backups',
        temp_dir: '/tmp/babak',
    };

    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        // Reset all mocks
        runDuplicityMock.mockClear();
        applyRetentionPolicyMock.mockClear();
        ensureDirMock.mockClear();
        getDirectorySizeMock.mockClear();
        mockFTPClient.access.mockClear();
        mockFTPClient.cd.mockClear();
        mockFTPClient.downloadTo.mockClear();
        mockFTPClient.uploadFrom.mockClear();
        mockFTPClient.downloadToDir.mockClear();
        mockFTPClient.remove.mockClear();
        mockFTPClient.list.mockClear();
        mockFTPClient.close.mockClear();

        // Reset implementations
        runDuplicityMock.mockResolvedValue(undefined);
        applyRetentionPolicyMock.mockResolvedValue(undefined);
        mockFTPClient.downloadTo.mockResolvedValue(undefined);
        mockFTPClient.remove.mockResolvedValue(undefined);
        mockFTPClient.list.mockResolvedValue([{ name: 'db.sql', size: 1000 }]);

        // Mock fetch
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('started', { status: 200 }),
        );

        // Mock Bun APIs
        spyOn(Bun, 'file').mockReturnValue({
            text: () => Promise.resolve('existing htaccess content'),
        } as ReturnType<typeof Bun.file>);
        spyOn(Bun, 'write').mockResolvedValue(0);
        spyOn(Bun, 'sleep').mockResolvedValue(undefined);

        // Mock Bun.$ for rm -rf
        const originalShell = Bun.$;
        Bun.$ = Object.assign(
            (..._args: unknown[]) => ({
                quiet: () => Promise.resolve(undefined),
            }),
            originalShell,
        );
    });

    afterEach(() => {
        mock.restore();
    });

    describe('successful backup', () => {
        test('returns success with size', async () => {
            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(true);
            expect(result.serviceName).toBe('wp-test');
            expect(result.size).toBe('500M');
        });

        test('connects to FTP with correct credentials', async () => {
            await runWordPressFTPBackup(service, config);
            expect(mockFTPClient.access).toHaveBeenCalledWith({
                host: 'ftp.example.com',
                user: 'ftpuser',
                password: 'ftppass',
                secure: false,
            });
        });

        test('changes to correct FTP directory', async () => {
            await runWordPressFTPBackup(service, config);
            expect(mockFTPClient.cd).toHaveBeenCalledWith('/public_html');
        });

        test('triggers dump script via HTTP', async () => {
            await runWordPressFTPBackup(service, config);
            expect(fetchSpy).toHaveBeenCalledWith(
                'https://example.com/db-dump.php',
                expect.objectContaining({ signal: expect.any(AbortSignal) }),
            );
        });

        test('cleans up remote files after download', async () => {
            await runWordPressFTPBackup(service, config);
            // db-dump.php and db.sql should be removed
            const removeArgs = mockFTPClient.remove.mock.calls.map(
                (c) => (c as unknown[])[0],
            );
            expect(removeArgs).toContain('db-dump.php');
            expect(removeArgs).toContain('db.sql');
        });

        test('runs duplicity on temp directory', async () => {
            await runWordPressFTPBackup(service, config);
            expect(runDuplicityMock).toHaveBeenCalledTimes(1);
        });

        test('downloads site files via FTP', async () => {
            await runWordPressFTPBackup(service, config);
            expect(mockFTPClient.downloadToDir).toHaveBeenCalledTimes(1);
        });

        test('closes FTP client on success', async () => {
            await runWordPressFTPBackup(service, config);
            expect(mockFTPClient.close).toHaveBeenCalled();
        });

        test('applies retention policy', async () => {
            await runWordPressFTPBackup(service, config);
            expect(applyRetentionPolicyMock).toHaveBeenCalledTimes(1);
        });
    });

    describe('htaccess modification', () => {
        test('appends SQL-blocking rules to htaccess', async () => {
            const writeSpy = spyOn(Bun, 'write').mockResolvedValue(0);
            await runWordPressFTPBackup(service, config);

            // Find the write call that contains the BlockSQLDownload rules
            const htaccessWrite = writeSpy.mock.calls.find(
                (c) =>
                    typeof (c as unknown[])[1] === 'string' &&
                    ((c as unknown[])[1] as string).includes(
                        'BlockSQLDownload',
                    ),
            );
            expect(htaccessWrite).toBeDefined();
            // htaccess should be uploaded back to FTP
            expect(mockFTPClient.uploadFrom).toHaveBeenCalled();
        });

        test('handles missing htaccess (creates empty)', async () => {
            mockFTPClient.downloadTo.mockRejectedValueOnce(
                new Error('not found'),
            );
            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(true);
        });
    });

    describe('dump polling', () => {
        test('polls until file size stabilizes', async () => {
            mockFTPClient.list
                .mockResolvedValueOnce([{ name: 'db.sql', size: 500 }])
                .mockResolvedValueOnce([{ name: 'db.sql', size: 1000 }])
                .mockResolvedValueOnce([{ name: 'db.sql', size: 1000 }]);

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(true);
            expect(Bun.sleep).toHaveBeenCalled();
        });

        test('times out after max attempts', async () => {
            mockFTPClient.list.mockResolvedValue([]);

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(false);
            expect(result.error).toContain('timeout');
        });
    });

    describe('HTTP dump trigger failures', () => {
        test('fails when HTTP response is not ok', async () => {
            fetchSpy.mockResolvedValue(
                new Response('Internal Server Error', {
                    status: 500,
                    statusText: 'Internal Server Error',
                }),
            );

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(false);
            expect(result.error).toContain('Failed to trigger database dump');
        });

        test('fails when dump script does not return "started"', async () => {
            fetchSpy.mockResolvedValue(
                new Response('<html>PHP error</html>', { status: 200 }),
            );

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(false);
            expect(result.error).toContain('did not execute correctly');
        });
    });

    describe('error cleanup', () => {
        test('attempts to remove db-dump.php and db.sql on error', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));

            await runWordPressFTPBackup(service, config);
            const removeArgs = mockFTPClient.remove.mock.calls.map(
                (c) => (c as unknown[])[0],
            );
            expect(removeArgs).toContain('db-dump.php');
            expect(removeArgs).toContain('db.sql');
        });

        test('restores original htaccess on error', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));

            await runWordPressFTPBackup(service, config);
            // uploadFrom should have been called for .htaccess restore
            expect(mockFTPClient.uploadFrom).toHaveBeenCalled();
        });

        test('closes FTP client on error', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));

            await runWordPressFTPBackup(service, config);
            expect(mockFTPClient.close).toHaveBeenCalled();
        });

        test('handles cleanup errors gracefully', async () => {
            runDuplicityMock.mockRejectedValueOnce(new Error('fail'));
            mockFTPClient.remove.mockRejectedValue(new Error('cleanup failed'));

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(false);
            // Should not throw
        });
    });

    describe('retention failure', () => {
        test('returns success with retentionError', async () => {
            applyRetentionPolicyMock.mockRejectedValueOnce(
                new Error('retention failed'),
            );

            const result = await runWordPressFTPBackup(service, config);
            expect(result.success).toBe(true);
            expect(result.retentionError).toBe('retention failed');
        });
    });
});
