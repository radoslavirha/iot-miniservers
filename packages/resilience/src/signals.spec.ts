import { describe, expect, it } from 'vitest';
import { combineSignals } from './signals.js';

describe('combineSignals', () => {
    it('returns undefined when no signals are provided', () => {
        expect(combineSignals()).toBeUndefined();
        expect(combineSignals(undefined, null)).toBeUndefined();
    });

    it('returns the single signal unchanged', () => {
        const controller = new AbortController();
        expect(combineSignals(undefined, controller.signal, null)).toBe(controller.signal);
    });

    it('aborts the combined signal when any input aborts', () => {
        const a = new AbortController();
        const b = new AbortController();
        const combined = combineSignals(a.signal, b.signal);

        expect(combined).toBeDefined();
        expect(combined?.aborted).toBe(false);

        b.abort();
        expect(combined?.aborted).toBe(true);
    });
});
