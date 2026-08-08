/** How the app currently rates its backend, derived from real request outcomes. */
export type ApiStatus =
    /** Requests are succeeding, or none have failed yet. */
    | 'ok'
    /** The backend answered, but with a server error. */
    | 'degraded'
    /** The request never reached the backend, or the browser is offline. */
    | 'unreachable';

/**
 * The result of one real request, reported by the app's API client.
 *
 * Note `client-error`: a 4xx means the backend is healthy and the *request* was
 * wrong. Treating it as degraded would light the banner on every validation
 * error, which is the mistake the per-page error handling in these apps makes
 * today.
 */
export type RequestOutcome =
    | { readonly kind: 'success' }
    | { readonly kind: 'server-error'; readonly status: number }
    | { readonly kind: 'client-error'; readonly status: number }
    | { readonly kind: 'network' };

export const statusForOutcome = (outcome: RequestOutcome): ApiStatus => {
    switch (outcome.kind) {
        case 'success':
        case 'client-error':
            return 'ok';
        case 'server-error':
            return 'degraded';
        case 'network':
            return 'unreachable';
    }
};
