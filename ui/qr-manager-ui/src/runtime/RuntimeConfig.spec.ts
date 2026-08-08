import { describe, expect, it } from 'vitest';
import { RuntimeConfigSchema } from './RuntimeConfig.js';

describe('RuntimeConfigSchema', () => {
    it('accepts a minimal config and defaults basePath', () => {
        const result = RuntimeConfigSchema.parse({ apiBaseURL: 'https://api.server.home/qr' });

        expect(result).toEqual({ apiBaseURL: 'https://api.server.home/qr', basePath: '/' });
    });

    it('strips trailing slashes from apiBaseURL so paths do not double up', () => {
        const result = RuntimeConfigSchema.parse({ apiBaseURL: 'https://api.server.home/qr///' });

        expect(result.apiBaseURL).toBe('https://api.server.home/qr');
    });

    it('keeps an explicit basePath', () => {
        const result = RuntimeConfigSchema.parse({
            apiBaseURL: 'https://api.server.home/qr',
            basePath: '/qr-manager'
        });

        expect(result.basePath).toBe('/qr-manager');
    });

    it.each([
        ['absent', {}],
        ['empty — the empty-Jinja2-substitution case', { apiBaseURL: '' }],
        ['not a URL', { apiBaseURL: 'nope' }],
        ['scheme-less, which plain z.url() would accept', { apiBaseURL: 'localhost:4002' }],
        ['a non-http scheme', { apiBaseURL: 'ftp://api.server.home' }]
    ])('rejects apiBaseURL %s', (_name, input) => {
        expect(RuntimeConfigSchema.safeParse(input).success).toBe(false);
    });

    it('rejects a basePath that is not absolute', () => {
        const result = RuntimeConfigSchema.safeParse({
            apiBaseURL: 'https://api.server.home/qr',
            basePath: 'qr-manager'
        });

        expect(result.success).toBe(false);
    });
});
