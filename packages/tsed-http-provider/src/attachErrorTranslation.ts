import { BadGateway, GatewayTimeout, ServiceUnavailable } from '@tsed/exceptions';
import { isBrokenCircuitError, isTaskCancelledError } from '@radoslavirha/resilience';
import axios, { type AxiosInstance } from 'axios';

/**
 * Translates transport failures into the HTTP status that describes *this*
 * service's situation — an unreachable dependency is our 502, never a
 * pass-through of the upstream's code.
 *
 * Attached **after** the factory's auth interceptor, not through the
 * `onInstanceCreated` seam: that seam runs first, so a `401` would be converted
 * into a `BadGateway` before the auth retry ever saw it.
 *
 * The original error is kept as `origin`, so a caller that cares about the
 * upstream status can still narrow:
 *
 * ```ts
 * catch (error) {
 *   if (error.origin?.response?.status === 404) throw new NotFound(...);
 *   throw error;
 * }
 * ```
 */
export function attachErrorTranslation(instance: AxiosInstance, api: string): void {
    instance.interceptors.response.use(
        (response) => response,
        (error: unknown) => Promise.reject(toHttpException(error, api))
    );
}

function toHttpException(error: unknown, api: string): Error {
    if (isBrokenCircuitError(error)) {
        return new ServiceUnavailable(`External API "${api}" is unavailable (circuit open).`, error);
    }

    if (isTaskCancelledError(error)) {
        return new GatewayTimeout(`External API "${api}" did not respond in time.`, error);
    }

    const status = axios.isAxiosError(error) ? error.response?.status : undefined;
    const detail = status === undefined ? 'could not be reached' : `responded with ${status}`;

    return new BadGateway(`External API "${api}" ${detail}.`, error);
}
