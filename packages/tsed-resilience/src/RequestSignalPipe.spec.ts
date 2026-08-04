import { EventEmitter } from 'node:events';
import type { PlatformContext } from '@tsed/platform-http';
import { describe, expect, it } from 'vitest';
import { RequestSignalPipe } from './RequestSignalPipe.js';
import { getRequestSignal } from './getRequestSignal.js';

function buildContext(raw: EventEmitter): PlatformContext {
    const store = new Map<string, unknown>();
    return {
        request: { raw },
        get: (key: string) => store.get(key),
        set: (key: string, value: unknown) => store.set(key, value)
    } as unknown as PlatformContext;
}

describe('RequestSignalPipe', () => {
    it('maps the platform context to the request-lifecycle signal', () => {
        const raw = new EventEmitter();
        const ctx = buildContext(raw);
        const signal = new RequestSignalPipe().transform(ctx);

        expect(signal).toBe(getRequestSignal(ctx));

        raw.emit('close');
        expect(signal.aborted).toBe(true);
    });
});
