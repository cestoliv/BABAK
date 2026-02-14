import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import path from 'node:path';
import { ensureDir, exec, getDirectorySize, resolvePath } from './utils.ts';

describe('resolvePath', () => {
    test('returns absolute path unchanged', () => {
        expect(resolvePath('/absolute/path')).toBe('/absolute/path');
    });

    test('resolves relative path against cwd', () => {
        const result = resolvePath('relative/path');
        expect(result).toBe(path.resolve(process.cwd(), 'relative/path'));
        expect(path.isAbsolute(result)).toBe(true);
    });

    test('resolves dot-relative path', () => {
        const result = resolvePath('./backups');
        expect(path.isAbsolute(result)).toBe(true);
    });
});

describe('exec', () => {
    afterEach(() => {
        mock.restore();
    });

    test('resolves on exit code 0', async () => {
        spyOn(Bun, 'spawn').mockReturnValue({
            exited: Promise.resolve(0),
        } as ReturnType<typeof Bun.spawn>);

        await expect(exec(['echo', 'hello'])).resolves.toBeUndefined();
    });

    test('passes command and stdio options to Bun.spawn', async () => {
        const spawnSpy = spyOn(Bun, 'spawn').mockReturnValue({
            exited: Promise.resolve(0),
        } as ReturnType<typeof Bun.spawn>);

        await exec(['echo', 'hello']);
        expect(spawnSpy).toHaveBeenCalledWith(['echo', 'hello'], {
            stdout: 'inherit',
            stderr: 'inherit',
        });
    });

    test('throws on non-zero exit code', async () => {
        spyOn(Bun, 'spawn').mockReturnValue({
            exited: Promise.resolve(1),
        } as ReturnType<typeof Bun.spawn>);

        await expect(exec(['bad', 'cmd'])).rejects.toThrow(
            'Command failed with exit code 1: bad cmd',
        );
    });

    test('includes exit code and command in error message', async () => {
        spyOn(Bun, 'spawn').mockReturnValue({
            exited: Promise.resolve(127),
        } as ReturnType<typeof Bun.spawn>);

        await expect(exec(['notfound'])).rejects.toThrow(
            'Command failed with exit code 127: notfound',
        );
    });
});

describe('ensureDir', () => {
    test('creates directory without throwing', async () => {
        const testDir = path.join('/tmp/babak-test', `test-${Date.now()}`);
        await expect(ensureDir(testDir)).resolves.toBeUndefined();
        // Clean up
        await Bun.$`rm -rf ${testDir}`.quiet();
    });

    test('succeeds when directory already exists', async () => {
        await expect(ensureDir('/tmp')).resolves.toBeUndefined();
    });
});

describe('getDirectorySize', () => {
    afterEach(() => {
        mock.restore();
    });

    test('returns parsed size from du output', async () => {
        const result = await getDirectorySize('/tmp');
        // Real call to du — just verify it returns a non-empty string
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
    });

    test('returns "unknown" for nonexistent directory', async () => {
        const result = await getDirectorySize(
            '/nonexistent/dir/that/does/not/exist',
        );
        expect(result).toBe('unknown');
    });
});
