import { DateTime } from 'luxon';
import { info, error as logError } from './log.ts';
import type { BackupResult } from './types/base.ts';

export interface NtfyConfig {
    url: string;
    topic: string;
    username?: string;
    password?: string;
}

export interface NotificationMessage {
    title: string;
    message: string;
    priority?: 'min' | 'low' | 'default' | 'high' | 'max';
    tags?: string[];
}

const buildNtfyHeaders = (
    ntfyConfig: NtfyConfig,
    title: string,
    priority: string,
    tags?: string,
): Record<string, string> => {
    const headers: Record<string, string> = {
        Title: title,
        Priority: priority,
    };

    if (tags) {
        headers.Tags = tags;
    }

    if (ntfyConfig.username && ntfyConfig.password) {
        const auth = Buffer.from(
            `${ntfyConfig.username}:${ntfyConfig.password}`,
        ).toString('base64');
        headers.Authorization = `Basic ${auth}`;
    }

    return headers;
};

/**
 * Send notification via ntfy.sh
 */
export const sendNotification = async (
    ntfyConfig: NtfyConfig,
    notification: NotificationMessage,
): Promise<void> => {
    const headers = buildNtfyHeaders(
        ntfyConfig,
        notification.title,
        notification.priority || 'default',
        notification.tags?.join(','),
    );

    const response = await fetch(`${ntfyConfig.url}/${ntfyConfig.topic}`, {
        method: 'POST',
        headers,
        body: notification.message,
        signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
        throw new Error(`Failed to send notification: ${response.statusText}`);
    }

    info('Notification sent successfully');
};

/**
 * Send an immediate notification when a single service fails.
 * Fire-and-forget: errors are logged but not propagated.
 */
export const sendServiceFailureNotification = async (
    ntfyConfig: NtfyConfig,
    serviceName: string,
    errorMsg: string,
): Promise<void> => {
    try {
        const headers = buildNtfyHeaders(
            ntfyConfig,
            `Backup Failed: ${serviceName}`,
            'high',
            'backup,error',
        );

        await fetch(`${ntfyConfig.url}/${ntfyConfig.topic}`, {
            method: 'POST',
            headers,
            body: `Service "${serviceName}" failed:\n${errorMsg}`,
            signal: AbortSignal.timeout(30_000),
        });
    } catch (err) {
        logError(
            `Failed to send service failure notification for ${serviceName}:`,
            err instanceof Error ? err.message : String(err),
        );
    }
};

/**
 * Format backup results into a summary message
 */
export const formatBackupSummary = (
    results: BackupResult[],
    startTime: DateTime,
): string => {
    const endTime = DateTime.now();
    const duration = endTime.diff(startTime, 'minutes').minutes.toFixed(2);

    const summary = results
        .map((r) => {
            const icon = r.success ? '✅' : '❌';
            const sizeInfo = r.size ? ` (${r.size})` : '';
            const errorInfo = r.error ? ` - ${r.error}` : '';
            const retentionInfo = r.retentionError
                ? ` ⚠️ Retention: ${r.retentionError}`
                : '';
            return `${icon} ${r.serviceName}${sizeInfo}${errorInfo}${retentionInfo}`;
        })
        .join('\n');

    return `🕐 ${endTime.toFormat('ccc dd LLLL yyyy')}
⌛ Time taken: ${duration} minutes

${summary}

😉, Babak`;
};
