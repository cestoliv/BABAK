import path from 'node:path';
import { error } from './log.ts';

/**
 * Resolve a path to an absolute path
 */
export const resolvePath = (p: string): string => {
    return path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
};

/**
 * Ensure a directory exists, creating it if necessary
 */
export const ensureDir = async (dirPath: string): Promise<void> => {
    await Bun.$`mkdir -p ${dirPath}`.quiet();
};

/**
 * Get the size of a directory in human-readable format
 */
export const getDirectorySize = async (dirPath: string): Promise<string> => {
    try {
        const result = await Bun.$`du -sh ${dirPath}`.quiet().text();
        return result.trim().split('\t')[0] || 'unknown';
    } catch (err) {
        error(`Failed to get directory size: ${err}`);
        return 'unknown';
    }
};

/**
 * Execute a command with error handling
 */
export const exec = async (cmd: string[]): Promise<void> => {
    const proc = Bun.spawn(cmd, {
        stdout: 'inherit',
        stderr: 'inherit',
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
        throw new Error(
            `Command failed with exit code ${exitCode}: ${cmd.join(' ')}`,
        );
    }
};
