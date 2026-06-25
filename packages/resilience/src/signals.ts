/**
 * Combines multiple optional {@link AbortSignal}s into a single signal that
 * aborts as soon as any of its inputs aborts. Nullish entries are ignored.
 *
 * Built on the native `AbortSignal.any` (Node >= 20), so no polyfill is needed
 * on this project's Node >= 24 runtime.
 *
 * - Returns `undefined` when no signals are provided, so the result can be
 *   forwarded straight into APIs that treat `signal: undefined` as "no signal".
 * - Returns the single signal unchanged when only one is provided (avoids an
 *   unnecessary wrapper).
 *
 * @example
 * ```ts
 * // merge a request-lifecycle signal with a per-operation timeout
 * const signal = combineSignals(requestSignal, AbortSignal.timeout(2000));
 * await fetch(url, { signal });
 * ```
 */
export function combineSignals(...signals: Array<AbortSignal | undefined | null>): AbortSignal | undefined {
    const present = signals.filter((signal): signal is AbortSignal => signal !== undefined && signal !== null);

    if (present.length === 0) {
        return undefined;
    }

    if (present.length === 1) {
        return present[0];
    }

    return AbortSignal.any(present);
}
