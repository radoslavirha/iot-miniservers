import type { PlatformContext } from '@tsed/platform-http';

/** Context key under which the per-request `AbortController` is memoised. */
const CONTROLLER_KEY = '$requestAbortController';

/** The slice of Node's `IncomingMessage` this module relies on. */
interface RawRequest {
    once?: (event: string, listener: () => void) => void;
}

/**
 * Returns the {@link AbortSignal} tied to this request's lifecycle. The signal
 * aborts when the client disconnects, so abandoned requests stop doing outbound
 * HTTP / database work.
 *
 * The controller is memoised on the {@link PlatformContext}, so every call
 * within a request returns the same signal, and it is garbage-collected with
 * the context.
 *
 * Prefer the {@link RequestSignal} parameter decorator in controllers; reach for
 * this function directly only in middlewares or filters that already hold a
 * `PlatformContext`.
 *
 * @example
 * ```ts
 * @Middleware()
 * class MyMiddleware {
 *   use(@Context() ctx: PlatformContext) {
 *     const signal = getRequestSignal(ctx);
 *   }
 * }
 * ```
 */
export function getRequestSignal(ctx: PlatformContext): AbortSignal {
    const existing = ctx.get<AbortController | undefined>(CONTROLLER_KEY);
    if (existing) {
        return existing.signal;
    }

    const controller = new AbortController();
    ctx.set(CONTROLLER_KEY, controller);

    const raw = ctx.request?.raw as RawRequest | undefined;
    if (typeof raw?.once === 'function') {
        const onDisconnect = (): void => {
            if (!controller.signal.aborted) {
                controller.abort();
            }
        };
        // On a client disconnect `aborted` fires first, so listening to it
        // cancels marginally sooner. `close` is the modern (Node >= 16) signal
        // and covers every other termination — on a *normal* request it fires
        // only once the handler has finished, so it never cancels early.
        raw.once('aborted', onDisconnect);
        raw.once('close', onDisconnect);
    }

    return controller.signal;
}
