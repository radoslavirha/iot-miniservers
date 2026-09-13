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
     * Keep `preStop + drainDelayMs + teardown + onStopped` inside
     * `terminationGracePeriodSeconds`.
     */
    drainDelayMs?: number;
    /**
     * Bounds the whole sequence — drain, `platform.stop()`, `onStopped`. When it overruns,
     * `onHardDeadline` runs. Off by default: a caller that has not sized its own budget is
     * better served by the pod's grace period than by a number guessed here.
     *
     * The alternative to setting it is not "shutdown takes longer". It is SIGKILL at the
     * end of `terminationGracePeriodSeconds`, which also discards the batched spans,
     * metrics and logs the drain produced — the exact telemetry that would have explained
     * why it hung.
     *
     * Size it inside the pod's budget: `preStop + drainDelayMs + hardDeadlineMs <
     * terminationGracePeriodSeconds`.
     */
    hardDeadlineMs?: number;
    /** Called when shutdown begins and when it completes. Wire to the app's logger. */
    onShutdown?: (phase: 'draining' | 'stopping' | 'stopped') => void;
    /**
     * Runs after the platform has fully stopped — for flushing telemetry, or anything else
     * that must outlive the listeners without delaying the drain.
     *
     * It belongs here, inside the re-entry guard, rather than after `shutdown()` at the
     * call site. On a second signal the returned handler returns *immediately* rather than
     * awaiting the first run, so a call-site `await shutdown(); await flush();` would flush
     * while the first shutdown is still draining. Time-box whatever runs here: it spends
     * the pod's remaining termination budget.
     */
    onStopped?: () => Promise<void> | void;
    /**
     * Runs when `hardDeadlineMs` elapses, with the milliseconds spent so far. Defaults to
     * ending the process with a non-zero status.
     *
     * Override it to log first — a pod that exits here has a connection that never closed
     * or a dependency that never released, and the log line is the only evidence that
     * survives, because the telemetry flush is precisely what did not finish. Tests
     * override it to assert without killing the runner.
     */
    onHardDeadline?: (elapsedMs: number) => void;
}

export const DEFAULT_DRAIN_DELAY_MS = 5_000;
/** Disabled. See `ShutdownHandlerOptions.hardDeadlineMs`. */
export const DEFAULT_HARD_DEADLINE_MS = 0;

const defaultHardExit = (): void => {
    process.exit(1);
};

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
 * 5. **`onStopped` last, still inside the guard.** Telemetry flushing has to come after
 *    the listeners are closed, and has to be unreachable by a second signal — see the
 *    option's own note for why the call site is the wrong place for it.
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
    const {
        drainDelayMs = DEFAULT_DRAIN_DELAY_MS,
        hardDeadlineMs = DEFAULT_HARD_DEADLINE_MS,
        onShutdown,
        onStopped,
        onHardDeadline = defaultHardExit
    } = options;
    let shuttingDown = false;

    return async (): Promise<void> => {
        if (shuttingDown) {
            return;
        }
        shuttingDown = true;

        const startedAt = Date.now();
        let deadline: NodeJS.Timeout | undefined;

        if (hardDeadlineMs > 0) {
            deadline = setTimeout(() => onHardDeadline(Date.now() - startedAt), hardDeadlineMs);
            // `unref` on purpose: this timer must never be the reason the process stays
            // alive. If the event loop empties, Node exits and there is nothing left to
            // kill. What keeps the loop alive in the case this guards — a socket that will
            // not close, a `stop()` awaiting a dependency that is gone — is exactly what
            // the deadline exists to end.
            deadline.unref();
        }

        try {
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

            await onStopped?.();
        } finally {
            // `finally`, not after `onStopped`: a teardown that throws must not leave a
            // timer that ends the process seconds later, from nowhere, after the caller
            // has already handled the error.
            if (deadline) {
                clearTimeout(deadline);
            }
        }
    };
};
