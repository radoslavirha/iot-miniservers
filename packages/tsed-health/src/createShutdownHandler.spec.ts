import { PlatformTest } from '@tsed/platform-http/testing';
import { inject } from '@tsed/di';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_DRAIN_DELAY_MS, createShutdownHandler } from './createShutdownHandler.js';
import { ShutdownState } from './ShutdownState.js';

describe('createShutdownHandler', () => {
    beforeEach(() => PlatformTest.create());
    afterEach(() => PlatformTest.reset());

    it('Should drain, wait, then stop the platform in that order', async () => {
        const order: string[] = [];
        const platform = {
            stop: vi.fn().mockImplementation(() => {
                order.push(`stop:draining=${inject<ShutdownState>(ShutdownState).draining}`);
            })
        };

        await createShutdownHandler(platform, { drainDelayMs: 0 })();

        // Readiness must already be failing by the time teardown starts — Ts.ED has no
        // pre-shutdown hook, so this ordering is the whole reason the helper exists.
        expect(order).toEqual(['stop:draining=true']);
        expect(platform.stop).toHaveBeenCalledOnce();
    });

    it('Should flip ShutdownState before stopping', async () => {
        const state = inject<ShutdownState>(ShutdownState);
        expect(state.draining).toBe(false);

        await createShutdownHandler({ stop: () => undefined }, { drainDelayMs: 0 })();

        expect(state.draining).toBe(true);
    });

    // kubelet follows SIGTERM with SIGKILL and process managers often send several;
    // a second teardown would run over a half-destroyed injector.
    it('Should stop the platform once however many times it is invoked', async () => {
        const platform = { stop: vi.fn() };
        const shutdown = createShutdownHandler(platform, { drainDelayMs: 0 });

        await Promise.all([shutdown(), shutdown(), shutdown()]);
        await shutdown();

        expect(platform.stop).toHaveBeenCalledOnce();
    });

    it('Should await an async stop rather than returning early', async () => {
        let stopped = false;
        const platform = {
            stop: async () => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                stopped = true;
            }
        };

        await createShutdownHandler(platform, { drainDelayMs: 0 })();

        expect(stopped).toBe(true);
    });

    it('Should wait for the drain delay before stopping', async () => {
        const platform = { stop: vi.fn() };

        const started = Date.now();
        await createShutdownHandler(platform, { drainDelayMs: 50 })();
        const elapsed = Date.now() - started;

        expect(elapsed).toBeGreaterThanOrEqual(45);
    });

    it('Should skip the wait when the delay is zero', async () => {
        const platform = { stop: vi.fn() };

        const started = Date.now();
        await createShutdownHandler(platform, { drainDelayMs: 0 })();

        expect(Date.now() - started).toBeLessThan(30);
    });

    it('Should report each phase through onShutdown', async () => {
        const phases: string[] = [];

        await createShutdownHandler(
            { stop: () => undefined },
            { drainDelayMs: 0, onShutdown: (phase) => phases.push(phase) }
        )();

        expect(phases).toEqual(['draining', 'stopping', 'stopped']);
    });

    it('Should default the drain delay to five seconds', () => {
        expect(DEFAULT_DRAIN_DELAY_MS).toBe(5_000);
    });

    it('Should run onStopped after the platform has stopped', async () => {
        const order: string[] = [];

        await createShutdownHandler(
            { stop: () => order.push('stop') },
            {
                drainDelayMs: 0,
                onStopped: () => {
                    order.push('stopped');
                }
            }
        )();

        // Telemetry flushed before the listeners close would miss the teardown it exists
        // to record.
        expect(order).toEqual(['stop', 'stopped']);
    });

    it('Should await an async onStopped rather than returning early', async () => {
        let flushed = false;

        await createShutdownHandler(
            { stop: () => undefined },
            {
                drainDelayMs: 0,
                onStopped: async () => {
                    await new Promise((resolve) => setTimeout(resolve, 30));
                    flushed = true;
                }
            }
        )();

        expect(flushed).toBe(true);
    });

    // The reason onStopped lives inside the guard rather than after `shutdown()` at the
    // call site: on re-entry the handler returns immediately instead of awaiting the first
    // run, so a call-site flush would fire while the first shutdown is still draining.
    it('Should run onStopped once however many times it is invoked', async () => {
        const onStopped = vi.fn();
        const shutdown = createShutdownHandler({ stop: vi.fn() }, { drainDelayMs: 20, onStopped });

        await Promise.all([shutdown(), shutdown(), shutdown()]);
        await shutdown();

        expect(onStopped).toHaveBeenCalledOnce();
    });
});

describe('ShutdownState', () => {
    beforeEach(() => PlatformTest.create());
    afterEach(() => PlatformTest.reset());

    it('Should not be draining initially', () => {
        expect(inject<ShutdownState>(ShutdownState).draining).toBe(false);
    });

    it('Should stay draining once begun', () => {
        const state = inject<ShutdownState>(ShutdownState);

        state.beginDrain();
        state.beginDrain();

        expect(state.draining).toBe(true);
    });
});
