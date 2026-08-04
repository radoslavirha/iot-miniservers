import { describe, expect, it } from 'vitest';
import { ExternalApiEntrySchema, createExternalApisSchema } from './externalApi.schema.js';

enum ExternalApi {
    MiotSpec = 'MIOT_SPEC'
}

describe('ExternalApiEntrySchema', () => {
    it('keeps the core provider fields and adds logging defaults', () => {
        const parsed = ExternalApiEntrySchema.parse({ baseURL: 'https://example.test' });

        expect(parsed.baseURL).toBe('https://example.test');
        expect(parsed.retriableStatusCodes).toEqual([500, 502, 503, 504]);
        expect(parsed.logging.enabled).toBe(true);
        expect(parsed.logging.headers.enabled).toBe(false);
        expect(parsed.logging.headers.redactPaths).toEqual([]);
        expect(parsed.logging.query.enabled).toBe(false);
        expect(parsed.logging.request.enabled).toBe(false);
        expect(parsed.logging.response.enabled).toBe(false);
        expect(parsed.logging.stack).toBe(false);
    });

    it('rejects a non-URL base', () => {
        expect(() => ExternalApiEntrySchema.parse({ baseURL: 'not-a-url' })).toThrow();
    });
});

describe('createExternalApisSchema', () => {
    const Schema = createExternalApisSchema(Object.values(ExternalApi));

    it('parses a configured key', () => {
        const parsed = Schema.parse({
            'MIOT_SPEC': { baseURL: 'https://miot-spec.org/miot-spec-v2' }
        });

        expect(parsed['MIOT_SPEC'].baseURL).toBe('https://miot-spec.org/miot-spec-v2');
        expect(parsed['MIOT_SPEC'].logging.enabled).toBe(true);
    });

    it('fails when a declared key is missing, rather than at first call', () => {
        expect(() => Schema.parse({})).toThrow();
    });

    it('applies logging overrides from configuration', () => {
        const parsed = Schema.parse({
            'MIOT_SPEC': {
                baseURL: 'https://miot-spec.org/miot-spec-v2',
                logging: { response: { enabled: false } }
            }
        });

        expect(parsed['MIOT_SPEC'].logging.response.enabled).toBe(false);
    });

    it('tolerates unknown configuration keys for rolling deployment compatibility', () => {
        const result = Schema.safeParse({
            'MIOT_SPEC': { baseURL: 'https://miot-spec.org/miot-spec-v2' },
            'UNKNOWN': { baseURL: 'https://unknown.test' }
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect((result.data as Record<string, unknown>)['UNKNOWN']).toBeUndefined();
        }
    });
});
