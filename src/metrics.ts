import { readFile, rename, writeFile } from 'node:fs/promises';
import type { BackupResult } from './types/base.ts';

const METRIC = 'babak_service_last_success_timestamp_seconds';

const escapeLabel = (v: string): string =>
    v.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n');
const unescapeLabel = (v: string): string =>
    v.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));

const readPrevious = async (path: string): Promise<Map<string, number>> => {
    const previous = new Map<string, number>();
    const text = await readFile(path, 'utf8').catch(() => '');
    for (const m of text.matchAll(/service="((?:[^"\\]|\\.)*)"\} (\d+)/g)) {
        previous.set(unescapeLabel(m[1] ?? ''), Number(m[2]));
    }
    return previous;
};

/**
 * Writes the last successful backup time of each configured service, for the
 * node_exporter textfile collector. A service that failed or was not selected
 * keeps its previous time, so "last success" survives a bad night.
 */
export const writeServiceMetrics = async (
    path: string,
    job: string,
    results: BackupResult[],
    configured: string[],
    now: Date = new Date(),
): Promise<void> => {
    const times = await readPrevious(path);
    for (const r of results) {
        if (r.success)
            times.set(r.serviceName, Math.floor(now.getTime() / 1000));
    }
    const lines = configured
        .filter((name) => times.has(name))
        .map(
            (name) =>
                `${METRIC}{job="${escapeLabel(job)}",service="${escapeLabel(name)}"} ${times.get(name)}\n`,
        );
    await writeFile(`${path}.tmp`, `# TYPE ${METRIC} gauge\n${lines.join('')}`);
    await rename(`${path}.tmp`, path);
};
