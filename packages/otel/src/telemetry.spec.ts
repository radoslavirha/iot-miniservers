import { metrics, trace } from '@opentelemetry/api';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMeter, getTracer } from './telemetry.js';

describe('telemetry', () => {
    afterEach(() => vi.restoreAllMocks());

    // Both delegate to the global providers, which are the API's no-op ones here — the state
    // every local `pnpm start` runs in, since `--import instrument.js` is only wired into
    // `start:prod`. The delegation is what matters; the returned proxies are fresh objects on
    // every call, so identity says nothing.
    describe('getTracer', () => {
        it('Should ask the global provider for the named tracer', () => {
            const getGlobalTracer = vi.spyOn(trace, 'getTracer');

            expect(getTracer('mqtt')).toBeDefined();
            expect(getGlobalTracer).toHaveBeenCalledWith('mqtt', undefined);
        });

        it('Should pass the version through', () => {
            const getGlobalTracer = vi.spyOn(trace, 'getTracer');

            getTracer('mqtt', '1.0.0');

            expect(getGlobalTracer).toHaveBeenCalledWith('mqtt', '1.0.0');
        });
    });

    describe('getMeter', () => {
        it('Should ask the global provider for the named meter', () => {
            const getGlobalMeter = vi.spyOn(metrics, 'getMeter');

            expect(getMeter('mqtt')).toBeDefined();
            expect(getGlobalMeter).toHaveBeenCalledWith('mqtt', undefined);
        });

        it('Should pass the version through', () => {
            const getGlobalMeter = vi.spyOn(metrics, 'getMeter');

            getMeter('mqtt', '1.0.0');

            expect(getGlobalMeter).toHaveBeenCalledWith('mqtt', '1.0.0');
        });
    });
});
