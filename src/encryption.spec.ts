import { afterEach, describe, expect, test } from 'bun:test';
import { getGPGKey, isEncryptionEnabled } from './encryption.ts';

describe('getGPGKey', () => {
    const originalEnv = process.env.GPG_KEY;

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.GPG_KEY = originalEnv;
        } else {
            delete process.env.GPG_KEY;
        }
    });

    test('returns gpg_key from systemConfig when provided', () => {
        expect(getGPGKey({ gpg_key: 'ABC123' })).toBe('ABC123');
    });

    test('returns GPG_KEY from environment when config has no key', () => {
        process.env.GPG_KEY = 'ENV_KEY_456';
        expect(getGPGKey({})).toBe('ENV_KEY_456');
        expect(getGPGKey({ gpg_key: undefined })).toBe('ENV_KEY_456');
    });

    test('prefers config gpg_key over env GPG_KEY', () => {
        process.env.GPG_KEY = 'ENV_KEY';
        expect(getGPGKey({ gpg_key: 'CONFIG_KEY' })).toBe('CONFIG_KEY');
    });

    test('returns undefined when neither config nor env provides a key', () => {
        delete process.env.GPG_KEY;
        expect(getGPGKey({})).toBeUndefined();
        expect(getGPGKey(undefined)).toBeUndefined();
    });

    test('returns undefined when systemConfig is undefined', () => {
        delete process.env.GPG_KEY;
        expect(getGPGKey()).toBeUndefined();
    });

    test('treats empty string config key as falsy (falls through to env)', () => {
        process.env.GPG_KEY = 'ENV_KEY';
        expect(getGPGKey({ gpg_key: '' })).toBe('ENV_KEY');
    });
});

describe('isEncryptionEnabled', () => {
    const originalEnv = process.env.GPG_KEY;

    afterEach(() => {
        if (originalEnv !== undefined) {
            process.env.GPG_KEY = originalEnv;
        } else {
            delete process.env.GPG_KEY;
        }
    });

    test('returns true when gpg_key is in config', () => {
        expect(isEncryptionEnabled({ gpg_key: 'KEY' })).toBe(true);
    });

    test('returns true when GPG_KEY is in env', () => {
        process.env.GPG_KEY = 'ENV_KEY';
        expect(isEncryptionEnabled({})).toBe(true);
    });

    test('returns false when no key is available', () => {
        delete process.env.GPG_KEY;
        expect(isEncryptionEnabled({})).toBe(false);
        expect(isEncryptionEnabled()).toBe(false);
    });
});
