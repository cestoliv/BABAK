import { expect, test } from 'bun:test';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DateTime } from 'luxon';
import { writeServiceMetrics } from './metrics.ts';
import type { BackupResult } from './types/base.ts';

const result = (
    serviceName: string,
    success: boolean,
    extra: Partial<BackupResult> = {},
): BackupResult => ({
    success,
    serviceName,
    startTime: DateTime.now(),
    endTime: DateTime.now(),
    ...extra,
});
const now = new Date('2026-11-01T01:00:00Z'); // 1793494800
const dir = () => mkdtempSync(join(tmpdir(), 'babak-metrics-'));

test('writes the success time for successful services', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    await writeServiceMetrics(
        path,
        'chevro',
        [result('Plausible', true)],
        ['Plausible'],
        now,
    );
    expect(readFileSync(path, 'utf8')).toContain(
        'babak_service_last_success_timestamp_seconds{job="chevro",service="Plausible"} 1793494800',
    );
});

test('keeps the previous timestamp of a service that failed this run', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    writeFileSync(
        path,
        'babak_service_last_success_timestamp_seconds{job="chevro",service="GitLab"} 1793400000\n',
    );
    await writeServiceMetrics(
        path,
        'chevro',
        [result('GitLab', false)],
        ['GitLab'],
        now,
    );
    expect(readFileSync(path, 'utf8')).toContain(
        'service="GitLab"} 1793400000',
    );
});

test('keeps services that were not selected in this run', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    writeFileSync(
        path,
        'babak_service_last_success_timestamp_seconds{job="chevro",service="Immich"} 1793400000\n',
    );
    await writeServiceMetrics(
        path,
        'chevro',
        [result('Plausible', true)],
        ['Plausible', 'Immich'],
        now,
    );
    const text = readFileSync(path, 'utf8');
    expect(text).toContain('service="Immich"} 1793400000');
    expect(text).toContain('service="Plausible"} 1793494800');
});

test('drops services no longer in the config', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    writeFileSync(
        path,
        'babak_service_last_success_timestamp_seconds{job="chevro",service="Old"} 1793400000\n',
    );
    await writeServiceMetrics(
        path,
        'chevro',
        [result('Plausible', true)],
        ['Plausible'],
        now,
    );
    expect(readFileSync(path, 'utf8')).not.toContain('Old');
});

test('escapes quotes in service names and reads them back', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    await writeServiceMetrics(
        path,
        'chevro',
        [result('Say "hi"', true)],
        ['Say "hi"'],
        now,
    );
    await writeServiceMetrics(
        path,
        'chevro',
        [result('Say "hi"', false)],
        ['Say "hi"'],
        now,
    );
    expect(readFileSync(path, 'utf8')).toContain(
        'service="Say \\"hi\\""} 1793494800',
    );
});

test('writes atomically and leaves no temp file', async () => {
    const d = dir();
    await writeServiceMetrics(
        join(d, 'babak-chevro.prom'),
        'chevro',
        [result('A', true)],
        ['A'],
        now,
    );
    expect(readdirSync(d)).toEqual(['babak-chevro.prom']);
});

test('writes the duration of the last run, failed or not', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    const startTime = DateTime.fromISO('2026-11-01T01:00:00Z');
    const endTime = DateTime.fromISO('2026-11-01T01:02:05Z');
    await writeServiceMetrics(
        path,
        'chevro',
        [result('GitLab', false, { startTime, endTime })],
        ['GitLab'],
        now,
    );
    expect(readFileSync(path, 'utf8')).toContain(
        'babak_service_last_duration_seconds{job="chevro",service="GitLab"} 125',
    );
});

test('writes the source size of a successful run and keeps it on failure', async () => {
    const path = join(dir(), 'babak-chevro.prom');
    await writeServiceMetrics(
        path,
        'chevro',
        [result('GitLab', true, { sourceBytes: 4096 })],
        ['GitLab'],
        now,
    );
    await writeServiceMetrics(
        path,
        'chevro',
        [result('GitLab', false)],
        ['GitLab'],
        now,
    );
    expect(readFileSync(path, 'utf8')).toContain(
        'babak_service_last_size_bytes{job="chevro",service="GitLab"} 4096',
    );
});
