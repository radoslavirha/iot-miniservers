/**
 * Request paths excluded from tracing.
 *
 * Kubernetes probe endpoints, polled every few seconds for the life of every pod. They
 * produce a permanent stream of identical, information-free spans that would dominate
 * trace volume and tell nobody anything.
 *
 * `/health` covers the Ts.ED APIs (`/health`, `/health/live`, `/health/ready`);
 * `/healthz` covers the nginx UIs.
 */
export const IGNORED_TRACE_PATHS = ['/health', '/healthz'] as const;

/**
 * Whether a request URL is a probe endpoint.
 *
 * Matches the pathname only — `/health/ready?verbose=1` must match `/health` — and
 * anchors on a path-segment boundary, so `/health` does not also silence an unrelated
 * `/healthchecks-admin` route.
 *
 * `request.url` from Node's HTTP server is always origin-form — a path, never absolute —
 * so splitting on `?` and `#` is enough and no URL parsing is needed.
 */
export const isIgnoredTracePath = (url: string | undefined): boolean => {
    if (!url) {
        return false;
    }

    const path = url.split('?')[0].split('#')[0];

    return IGNORED_TRACE_PATHS.some((entry) => path === entry || path.startsWith(`${entry}/`));
};
