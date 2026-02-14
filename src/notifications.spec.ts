import {
    afterEach,
    beforeEach,
    describe,
    expect,
    mock,
    spyOn,
    test,
} from 'bun:test';
import { DateTime } from 'luxon';
import {
    formatBackupSummary,
    sendNotification,
    sendServiceFailureNotification,
} from './notifications.ts';
import type { BackupResult } from './types/base.ts';

describe('sendNotification', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
    });

    afterEach(() => {
        mock.restore();
    });

    const ntfyConfig = {
        url: 'https://ntfy.example.com',
        topic: 'test-topic',
    };

    test('POSTs to correct URL with headers and body', async () => {
        await sendNotification(ntfyConfig, {
            title: 'Test Title',
            message: 'Test body',
        });

        expect(fetchSpy).toHaveBeenCalledTimes(1);
        const call = fetchSpy.mock.calls[0];
        const [url, options] = call ?? [];
        expect(url).toBe('https://ntfy.example.com/test-topic');
        expect(options?.method).toBe('POST');
        expect(options?.body).toBe('Test body');
        expect(options?.headers.Title).toBe('Test Title');
        expect(options?.headers.Priority).toBe('default');
    });

    test('includes tags header when tags provided', async () => {
        await sendNotification(ntfyConfig, {
            title: 'Test',
            message: 'body',
            tags: ['backup', 'success'],
        });

        const options = fetchSpy.mock.calls[0]?.[1];
        expect(options?.headers.Tags).toBe('backup,success');
    });

    test('includes Authorization header when credentials provided', async () => {
        const authConfig = {
            ...ntfyConfig,
            username: 'user',
            password: 'pass',
        };
        await sendNotification(authConfig, {
            title: 'Test',
            message: 'body',
        });

        const expectedAuth = Buffer.from('user:pass').toString('base64');
        const options = fetchSpy.mock.calls[0]?.[1];
        expect(options?.headers.Authorization).toBe(`Basic ${expectedAuth}`);
    });

    test('does NOT include Authorization when no credentials', async () => {
        await sendNotification(ntfyConfig, {
            title: 'Test',
            message: 'body',
        });

        const options = fetchSpy.mock.calls[0]?.[1];
        expect(options?.headers.Authorization).toBeUndefined();
    });

    test('throws on non-ok HTTP response', async () => {
        fetchSpy.mockResolvedValue(
            new Response('Forbidden', { status: 403, statusText: 'Forbidden' }),
        );

        await expect(
            sendNotification(ntfyConfig, {
                title: 'Test',
                message: 'body',
            }),
        ).rejects.toThrow('Failed to send notification');
    });

    test('uses provided priority', async () => {
        await sendNotification(ntfyConfig, {
            title: 'Test',
            message: 'body',
            priority: 'high',
        });

        const options = fetchSpy.mock.calls[0]?.[1];
        expect(options?.headers.Priority).toBe('high');
    });
});

describe('sendServiceFailureNotification', () => {
    let fetchSpy: ReturnType<typeof spyOn>;

    beforeEach(() => {
        fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
            new Response('ok', { status: 200 }),
        );
    });

    afterEach(() => {
        mock.restore();
    });

    const ntfyConfig = {
        url: 'https://ntfy.example.com',
        topic: 'test',
    };

    test('sends failure notification with high priority', async () => {
        await sendServiceFailureNotification(
            ntfyConfig,
            'my-service',
            'it broke',
        );

        const call = fetchSpy.mock.calls[0];
        const [url, options] = call ?? [];
        expect(url).toBe('https://ntfy.example.com/test');
        expect(options?.body).toBe('Service "my-service" failed:\nit broke');
        expect(options?.headers.Title).toBe('Backup Failed: my-service');
        expect(options?.headers.Priority).toBe('high');
        expect(options?.headers.Tags).toBe('backup,error');
    });

    test('swallows fetch errors (fire-and-forget)', async () => {
        fetchSpy.mockRejectedValue(new Error('Network error'));

        await expect(
            sendServiceFailureNotification(ntfyConfig, 'svc', 'err'),
        ).resolves.toBeUndefined();
    });
});

describe('formatBackupSummary', () => {
    const fixedNow = DateTime.fromISO('2026-02-24T15:30:00.000Z');

    beforeEach(() => {
        spyOn(DateTime, 'now').mockReturnValue(fixedNow as DateTime<true>);
    });

    afterEach(() => {
        mock.restore();
    });

    test('formats successful results', () => {
        const startTime = DateTime.fromISO('2026-02-24T15:00:00.000Z');
        const results: BackupResult[] = [
            {
                success: true,
                serviceName: 'local-backup',
                size: '1.5G',
                startTime,
                endTime: fixedNow,
            },
        ];

        const summary = formatBackupSummary(results, startTime);
        expect(summary).toContain('local-backup');
        expect(summary).toContain('1.5G');
        expect(summary).toContain('30.00 minutes');
        expect(summary).toContain('Babak');
    });

    test('formats failed results with error info', () => {
        const startTime = DateTime.fromISO('2026-02-24T15:25:00.000Z');
        const results: BackupResult[] = [
            {
                success: false,
                serviceName: 'ssh-backup',
                error: 'Connection refused',
                startTime,
                endTime: fixedNow,
            },
        ];

        const summary = formatBackupSummary(results, startTime);
        expect(summary).toContain('ssh-backup');
        expect(summary).toContain('Connection refused');
    });

    test('includes retention warning when present', () => {
        const startTime = fixedNow;
        const results: BackupResult[] = [
            {
                success: true,
                serviceName: 'test',
                retentionError: 'cleanup failed',
                startTime,
                endTime: fixedNow,
            },
        ];

        const summary = formatBackupSummary(results, startTime);
        expect(summary).toContain('Retention: cleanup failed');
    });

    test('handles multiple results', () => {
        const startTime = fixedNow;
        const results: BackupResult[] = [
            {
                success: true,
                serviceName: 'svc1',
                size: '1G',
                startTime,
                endTime: fixedNow,
            },
            {
                success: false,
                serviceName: 'svc2',
                error: 'fail',
                startTime,
                endTime: fixedNow,
            },
        ];

        const summary = formatBackupSummary(results, startTime);
        expect(summary).toContain('svc1');
        expect(summary).toContain('svc2');
    });

    test('handles empty results array', () => {
        const startTime = fixedNow;
        const summary = formatBackupSummary([], startTime);
        expect(summary).toContain('Babak');
        expect(summary).toContain('minutes');
    });
});
