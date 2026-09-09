import type { RequestOutcome } from './ApiStatus.js';

/** Classifies a completed response by status code. */
export const classifyResponse = (response: { readonly status: number }): RequestOutcome => {
    if (response.status >= 500) {
        return { kind: 'server-error', status: response.status };
    }
    // Checked before the generic 4xx branch, and it has to be: these two say the
    // caller is not accepted, where every other 4xx says the request was wrong.
    // Reported as an ordinary client error they map to `ok`, and an app whose
    // session has expired shows a healthy banner over pages that cannot load.
    if (response.status === 401 || response.status === 403) {
        return { kind: 'unauthorized', status: response.status };
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
