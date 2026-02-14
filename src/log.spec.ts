import { afterEach, describe, expect, mock, spyOn, test } from 'bun:test';
import { debug, error, info, warn } from './log.ts';

describe('log', () => {
    afterEach(() => {
        mock.restore();
    });

    describe('info', () => {
        test('calls console.log with green [INFO] prefix', () => {
            const spy = spyOn(console, 'log').mockImplementation(() => {});
            info('test message');
            expect(spy).toHaveBeenCalledTimes(1);
            expect(spy).toHaveBeenCalledWith(
                '\x1b[32m[INFO]\x1b[0m  ',
                'test message',
            );
        });

        test('passes multiple arguments', () => {
            const spy = spyOn(console, 'log').mockImplementation(() => {});
            info('message', 42, { key: 'val' });
            expect(spy).toHaveBeenCalledWith(
                '\x1b[32m[INFO]\x1b[0m  ',
                'message',
                42,
                { key: 'val' },
            );
        });
    });

    describe('warn', () => {
        test('calls console.warn with yellow [WARN] prefix', () => {
            const spy = spyOn(console, 'warn').mockImplementation(() => {});
            warn('warning message');
            expect(spy).toHaveBeenCalledWith(
                '\x1b[33m[WARN]\x1b[0m  ',
                'warning message',
            );
        });
    });

    describe('error', () => {
        test('calls console.error with red [ERROR] prefix', () => {
            const spy = spyOn(console, 'error').mockImplementation(() => {});
            error('error message');
            expect(spy).toHaveBeenCalledWith(
                '\x1b[31m[ERROR]\x1b[0m ',
                'error message',
            );
        });
    });

    describe('debug', () => {
        const originalDebug = process.env.DEBUG;

        afterEach(() => {
            if (originalDebug !== undefined) {
                process.env.DEBUG = originalDebug;
            } else {
                delete process.env.DEBUG;
            }
        });

        test('calls console.log when DEBUG env is set', () => {
            process.env.DEBUG = '1';
            const spy = spyOn(console, 'log').mockImplementation(() => {});
            debug('debug message');
            expect(spy).toHaveBeenCalledWith(
                '\x1b[34m[DEBUG]\x1b[0m ',
                'debug message',
            );
        });

        test('does NOT log when DEBUG env is not set', () => {
            delete process.env.DEBUG;
            const spy = spyOn(console, 'log').mockImplementation(() => {});
            debug('debug message');
            expect(spy).not.toHaveBeenCalled();
        });

        test('does NOT log when DEBUG is empty string', () => {
            process.env.DEBUG = '';
            const spy = spyOn(console, 'log').mockImplementation(() => {});
            debug('debug message');
            expect(spy).not.toHaveBeenCalled();
        });
    });
});
