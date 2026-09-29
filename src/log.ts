/** biome-ignore-all lint/suspicious/noConsole: log utility */
export const info = (...args: unknown[]): void => {
    console.log(`\x1b[32m[INFO]\x1b[0m  `, ...args);
};

export const warn = (...args: unknown[]): void => {
    console.warn(`\x1b[33m[WARN]\x1b[0m  `, ...args);
};

export const error = (...args: unknown[]): void => {
    console.error(`\x1b[31m[ERROR]\x1b[0m `, ...args);
};

// DEBUG=1, true or yes turns debug logs on; unset, empty, 0 or false keeps them off
const isDebugEnabled = (): boolean =>
    ['1', 'true', 'yes'].includes((process.env.DEBUG ?? '').toLowerCase());

export const debug = (...args: unknown[]): void => {
    if (isDebugEnabled()) {
        console.log(`\x1b[34m[DEBUG]\x1b[0m `, ...args);
    }
};
