import { describe, expect, it } from 'vitest';
import { ResiliencePolicyFactory } from './ResiliencePolicyFactory.js';

describe('ResiliencePolicyFactory', () => {
    it('throws when a key is not configured', () => {
        const factory = new ResiliencePolicyFactory<'unknown'>({});
        expect(() => factory.get('unknown')).toThrow('Resilience policy "unknown" is not configured');
    });

    it('builds a policy for a configured key', () => {
        const factory = new ResiliencePolicyFactory({
            db: { timeout: { ms: 1000 } }
        });
        const policy = factory.get('db');
        expect(typeof policy.execute).toBe('function');
    });

    it('caches the same policy on repeated get()', () => {
        const factory = new ResiliencePolicyFactory({
            api: { circuitBreaker: {} }
        });
        expect(factory.get('api')).toBe(factory.get('api'));
    });

    it('passes per-key options through to the policy', async () => {
        const factory = new ResiliencePolicyFactory(
            { api: { retry: { count: 2, backoffMs: 0 } } },
            { api: { shouldHandle: () => false } }
        );

        let calls = 0;
        await expect(
            factory.get('api').execute(async () => {
                calls++;
                throw new Error('boom');
            })
        ).rejects.toThrow('boom');

        // shouldHandle returns false → not retried
        expect(calls).toBe(1);
    });
});
