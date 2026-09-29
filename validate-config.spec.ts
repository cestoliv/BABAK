import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dir, 'validate-config.ts');

describe('validate-config', () => {
    let tmpDir: string;

    beforeAll(async () => {
        tmpDir = await mkdtemp(join(tmpdir(), 'babak-test-'));
    });

    afterAll(async () => {
        await rm(tmpDir, { recursive: true });
    });

    const writeConfig = async (name: string, content: string) => {
        const path = join(tmpDir, name);
        await writeFile(path, content);
        return path;
    };

    const run = async (args: string[] = []) => {
        const proc = Bun.spawn(['bun', script, ...args], {
            stdout: 'pipe',
            stderr: 'pipe',
        });
        const [stdout, stderr] = await Promise.all([
            new Response(proc.stdout).text(),
            new Response(proc.stderr).text(),
        ]);
        const exitCode = await proc.exited;
        return { stdout, stderr, exitCode };
    };

    test('validates a valid config and prints services', async () => {
        const configPath = await writeConfig(
            'valid.yml',
            `
services:
  - type: local
    name: my-local
    paths: [/tmp]
  - type: local
    name: other
    enabled: false
    paths: [/var]
`,
        );

        const { stdout, exitCode } = await run([configPath]);
        expect(exitCode).toBe(0);
        expect(stdout).toContain('Config validated successfully');
        expect(stdout).toContain('my-local | enabled: true');
        expect(stdout).toContain('other | enabled: false');
    });

    test('exits 1 on invalid config', async () => {
        const configPath = await writeConfig(
            'invalid.yml',
            `
system:
  backup_dir: /backups
`,
        );

        const { exitCode } = await run([configPath]);
        expect(exitCode).toBe(1);
    });

    test('exits 1 on nonexistent file', async () => {
        const { exitCode } = await run([join(tmpDir, 'nonexistent.yml')]);
        expect(exitCode).toBe(1);
    });
});
