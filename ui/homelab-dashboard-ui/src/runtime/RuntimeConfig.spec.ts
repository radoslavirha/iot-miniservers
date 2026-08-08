import { describe, expect, it } from 'vitest';
import { AppConfigSchema } from './RuntimeConfig.js';

const minimal = { unifi: { host: 'https://192.168.1.1', apiKey: 'test-key' } };

describe('AppConfigSchema', () => {
    it('accepts a minimal config and applies defaults', () => {
        const config = AppConfigSchema.parse(minimal);

        expect(config.unifi).toEqual({ host: 'https://192.168.1.1', apiKey: 'test-key', site: 'default' });
        expect(config.serverPattern).toBe('^server(\\d+)\\.home$');
        expect(config.scheme).toBe('http');
        expect(config.exclude).toEqual([]);
        expect(config.paths).toEqual({});
    });

    it('rejects a missing unifi.host', () => {
        expect(AppConfigSchema.safeParse({ unifi: { apiKey: 'key' } }).success).toBe(false);
    });

    it('rejects a missing unifi.apiKey', () => {
        expect(AppConfigSchema.safeParse({ unifi: { host: 'https://192.168.1.1' } }).success).toBe(false);
    });

    it('rejects an empty unifi.apiKey — the old entrypoint never checked this', () => {
        const result = AppConfigSchema.safeParse({ unifi: { host: 'https://192.168.1.1', apiKey: '' } });

        expect(result.success).toBe(false);
    });

    it('rejects a unifi.host that is not an absolute http(s) URL', () => {
        expect(AppConfigSchema.safeParse({ unifi: { host: '192.168.1.1', apiKey: 'k' } }).success).toBe(false);
    });

    it('rejects a serverPattern that is not a valid regex', () => {
        const result = AppConfigSchema.safeParse({ ...minimal, serverPattern: '^server(\\d+' });

        expect(result.success).toBe(false);
    });

    it('rejects an unknown scheme', () => {
        expect(AppConfigSchema.safeParse({ ...minimal, scheme: 'gopher' }).success).toBe(false);
    });

    it('never puts a config value in the error output', () => {
        const sentinel = 'sup3r-s3cret-sentinel';
        const result = AppConfigSchema.safeParse({ unifi: { host: sentinel, apiKey: '' } });

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).not.toContain(sentinel);
    });
});
