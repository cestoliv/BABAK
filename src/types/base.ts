import type { DateTime } from 'luxon';

export interface BackupResult {
    success: boolean;
    serviceName: string;
    size?: string;
    /** Size of the data backed up, in bytes, measured before Duplicity runs */
    sourceBytes?: number;
    error?: string;
    retentionError?: string;
    startTime: DateTime;
    endTime: DateTime;
}
