import { setTimeout as delay } from 'node:timers/promises';
import { inject } from '@tsed/di';
import { ShutdownState } from './ShutdownState.js';

/** Anything with an awaitable `stop()` — `PlatformBuilder`, or a stub in tests. */
export interface StoppablePlatform {
    stop(): Promise<unknown> | unknown;
}

export interface ShutdownHandlerOptions {
    /**
     * How long to keep serving after readiness starts failing, so requests already in
     * flight can finish before the injector is destroyed.
     *
     * This is a *different* window from the chart's `preStop` sleep. `preStop` runs to
     * completion **before** kubelet sends SIGTERM, and covers Endpoints removal
     * propagating to Traefik — new requests. By the time SIGTERM arrives it is over, so
     * it does nothing for a request that is mid-Mongo-query when `platform.stop()`
     * destroys the injector underneath it. That is this window.
     *
     * Keep `preStop + drainDelayMs + teardown` inside `terminationGracePeriodSeconds`.
     */
    drainDelayMs?: number;
    /** Called when shutdown begins and when it completes. Wire to the app's logger. */
    onShutdown?: (phase: 'draining' | 'stopping' | 'stopped') => void;
}

export const DEFAULT_DRAIN_DELAY_MS = 5_000;

/**
 * Builds the signal handler that shuts the platform down gracefully.
 *
 * Sequence, and why each step is where it is:
 *
 * 1. **Guard against re-entry.** A second signal is routine — kubelet follows SIGTERM
 *    with SIGKILL, and process managers often send several. Without the guard, the second
 *    one starts a fresh teardown over a half-destroyed injector.
 * 2. **`beginDrain()` first.** `/health/ready` starts answering 503 immediately, so
 *    kubelet stops sending new work. This must happen before any teardown: Ts.ED has no
 *    pre-shutdown hook — `platform.stop()` is `destroyInjector()` (which emits
 *    `$onDestroy`) then closes the listeners, so `$onDestroy` fires alongside mongoose and
 *    MQTT disconnecting, far too late to be useful.
 * 3. **Wait.** In-flight requests finish while dependencies are still connected.
 * 4. **`await platform.stop()`.** Awaited, unlike the handler this replaces — an
 *    un-awaited `stop()` lets Node exit as soon as the event loop drains, cutting teardown
 *    short.
 *
 * Do **not** register this for `beforeExit`: that fires when the event loop empties, not
 * on a signal, and would trigger a shutdown the process was not asked to perform.
 *
 * ```ts
 * const shutdown = createShutdownHandler(platform, { drainDelayMs: config.server.drainDelayMs });
 * ['SIGTERM', 'SIGINT', 'SIGQUIT'].forEach((evt) => process.on(evt, shutdown));
 * ```
 */
export const createShutdownHandler = (
    platform: StoppablePlatform,
    options: ShutdownHandlerOptions = {}
): (() => Promise<void>) => {
    const { drainDelayMs = DEFAULT_DRAIN_DELAY_MS, onShutdown } = options;
    let shuttingDown = false;

    return async (): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;

        onShutdown?.('draining');
        // Resolved here rather than captured at construction: the handler is built during
        // bootstrap, when the container may not yet hold the provider.
        inject<ShutdownState>(ShutdownState).beginDrain();

        if (drainDelayMs > 0) {
            await delay(drainDelayMs);
        }

        onShutdown?.('stopping');
        await platform.stop();
        onShutdown?.('stopped');
    };
};
