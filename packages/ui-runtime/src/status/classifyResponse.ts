import type { RequestOutcome } from './ApiStatus.js';

/** Classifies a completed response by status code. */
export const classifyResponse = (response: { readonly status: number }): RequestOutcome => {
    if (response.status >= 500) {
        return { kind: 'server-error', status: response.status };
    }
    if (response.status >= 400) {
        return { kind: 'client-error', status: response.status };
    }
    return { kind: 'success' };
};

/**
 * Classifies a thrown error. `fetch` rejects only when the request could not be
 * made at all — DNS, TLS, connection refused, offline — so anything reaching
 * here is a reachability problem, not an application one.
 */
export const classifyError = (): RequestOutcome => ({ kind: 'network' });
