/** How the app currently rates its backend, derived from real request outcomes. */
export type ApiStatus =
    /** Requests are succeeding, or none have failed yet. */
    | 'ok'
    /** The backend answered, but with a server error. */
    | 'degraded'
    /** The request never reached the backend, or the browser is offline. */
    | 'unreachable'
    /** The backend refused the credential — expired session, or none at all. */
    | 'unauthenticated';

/**
 * The result of one real request, reported by the app's API client.
 *
 * Note `client-error`: a 4xx means the backend is healthy and the *request* was
 * wrong. Treating it as degraded would light the banner on every validation
 * error, which is the mistake the per-page error handling in these apps makes
 * today.
 *
 * `unauthorized` is split out of `client-error` for the opposite reason. It is
 * the one 4xx that is not about the request at all — the backend is fine and the
 * *caller* is not, so nothing the user types will fix it and no page-level error
 * message is the right place to say so. Folded in with the rest it reported as
 * `ok`, which is how an expired session showed a healthy banner over an app that
 * could no longer load anything.
 */
export type RequestOutcome =
    | { readonly kind: 'success' }
    | { readonly kind: 'server-error'; readonly status: number }
    | { readonly kind: 'client-error'; readonly status: number }
    | { readonly kind: 'unauthorized'; readonly status: number }
    | { readonly kind: 'network' };

export const statusForOutcome = (outcome: RequestOutcome): ApiStatus => {
    switch (outcome.kind) {
        case 'success':
        case 'client-error':
            return 'ok';
        case 'unauthorized':
            return 'unauthenticated';
        case 'server-error':
            return 'degraded';
        case 'network':
            return 'unreachable';
    }
};
