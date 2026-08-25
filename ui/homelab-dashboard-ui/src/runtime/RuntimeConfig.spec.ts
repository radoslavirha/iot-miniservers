import { describe, expect, it } from 'vitest';
import { AppConfigSchema } from './RuntimeConfig.js';

const minimal = { unifi: {} };

describe('AppConfigSchema', () => {
    it('accepts a minimal config and applies defaults', () => {
        const config = AppConfigSchema.parse(minimal);

        expect(config.unifi).toEqual({ site: 'default' });
        expect(config.serverPattern).toBe('^server(\\d+)\\.home$');
        expect(config.scheme).toBe('http');
        expect(config.exclude).toEqual([]);
        expect(config.paths).toEqual({});
    });

    it('accepts a config still carrying the old host/apiKey fields', () => {
        // Zod strips unknown keys, so this image runs against a config.json
        // that still carries the old credential fields. Keeps a stale ConfigMap
        // from failing the validating initContainer, and means the ConfigMap and
        // the image can be updated in either order.
        const result = AppConfigSchema.safeParse({
            unifi: { host: 'https://192.168.1.1', apiKey: 'stale-key', site: 'default' }
        });

        expect(result.success).toBe(true);
        expect(result.data?.unifi).toEqual({ site: 'default' });
    });

    it('rejects an empty unifi.site', () => {
        expect(AppConfigSchema.safeParse({ unifi: { site: '' } }).success).toBe(false);
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
        const result = AppConfigSchema.safeParse({ unifi: { site: '' }, scheme: sentinel });

        expect(result.success).toBe(false);
        expect(JSON.stringify(result.error?.issues)).not.toContain(sentinel);
    });
});
