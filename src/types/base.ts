import type { DateTime } from 'luxon';

export interface BackupResult {
    success: boolean;
    serviceName: string;
    size?: string;
    error?: string;
    retentionError?: string;
    startTime: DateTime;
    endTime: DateTime;
}
