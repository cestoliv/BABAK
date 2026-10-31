import { readFile, rename, writeFile } from 'node:fs/promises';
import type { BackupResult } from './types/base.ts';

const SUCCESS = 'babak_service_last_success_timestamp_seconds';
const DURATION = 'babak_service_last_duration_seconds';
const SIZE = 'babak_service_last_size_bytes';

const escapeLabel = (v: string): string =>
    v.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
const unescapeLabel = (v: string): string =>
    v.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

// metric name -> service -> value
type Values = Map<string, Map<string, number>>;

const readPrevious = async (path: string): Promise<Values> => {
    const previous: Values = new Map(
        [SUCCESS, DURATION, SIZE].map((m) => [m, new Map()]),
    );
    const text = await readFile(path, 'utf8').catch(() => '');
    for (const m of text.matchAll(
        /^(\w+)\{.*service="((?:[^"\\]|\\.)*)"\} (\d+)$/gm,
    )) {
        previous.get(m[1] ?? '')?.set(unescapeLabel(m[2] ?? ''), Number(m[3]));
    }
    return previous;
};

/**
 * Writes, for each configured service, the time and source size of its last
 * successful backup and the duration of its last run, for the node_exporter
 * textfile collector. A service that failed or was not selected keeps its
 * previous values, so they survive a bad night.
 */
export const writeServiceMetrics = async (
    path: string,
    job: string,
    results: BackupResult[],
    configured: string[],
    now: Date = new Date(),
): Promise<void> => {
    const values = await readPrevious(path);
    const set = (metric: string, service: string, value: number) =>
        values.get(metric)?.set(service, value);
    for (const r of results) {
        set(
            DURATION,
            r.serviceName,
            Math.round(r.endTime.diff(r.startTime, 'seconds').seconds),
        );
        if (!r.success) continue;
        set(SUCCESS, r.serviceName, Math.floor(now.getTime() / 1000));
        if (r.sourceBytes !== undefined)
            set(SIZE, r.serviceName, r.sourceBytes);
    }
    let text = '';
    for (const [metric, byService] of values) {
        text += `# TYPE ${metric} gauge\n`;
        for (const name of configured) {
            const v = byService.get(name);
            if (v === undefined) continue;
            text += `${metric}{job="${escapeLabel(job)}",service="${escapeLabel(name)}"} ${v}\n`;
        }
    }
    await writeFile(`${path}.tmp`, text);
    await rename(`${path}.tmp`, path);
};
