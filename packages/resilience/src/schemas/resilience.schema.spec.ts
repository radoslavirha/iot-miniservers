import { describe, expect, it } from 'vitest';
import {
    CircuitBreakerConfigSchema,
    ResilienceConfigSchema,
    RetryConfigSchema,
    TimeoutConfigSchema
} from './resilience.schema.js';

describe('resilience.schema', () => {
    it('applies timeout defaults', () => {
        expect(TimeoutConfigSchema.parse({})).toEqual({ ms: 5000 });
    });

    it('applies retry defaults', () => {
        expect(RetryConfigSchema.parse({})).toEqual({ count: 0, backoffMs: 250 });
    });

    it('applies circuit breaker defaults', () => {
        expect(CircuitBreakerConfigSchema.parse({})).toEqual({
            halfOpenAfterMs: 10000,
            threshold: 0.5,
            samplingDurationMs: 10000,
            minimumThroughput: 5
        });
    });

    it('leaves all resilience sections optional', () => {
        expect(ResilienceConfigSchema.parse({})).toEqual({});
    });

    it('rejects a threshold outside 0..1', () => {
        expect(() => CircuitBreakerConfigSchema.parse({ threshold: 1.5 })).toThrow();
    });

    it('rejects a negative timeout', () => {
        expect(() => TimeoutConfigSchema.parse({ ms: -1 })).toThrow();
    });

    it('rejects a non-integer retry count', () => {
        expect(() => RetryConfigSchema.parse({ count: 1.5 })).toThrow();
    });
});
