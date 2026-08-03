/**
 * HTTP verbs this client supports — the standardised methods only.
 *
 * `QUERY` is the safe, body-carrying counterpart to `GET`: use it when a lookup
 * needs a payload too large or too structured for a query string. Non-standard
 * verbs some clients accept (`PURGE`, `LINK`, `UNLINK`) are deliberately absent.
 */
export type HttpMethod =
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'PATCH'
    | 'DELETE'
    | 'HEAD'
    | 'OPTIONS'
    | 'QUERY';

/**
 * How the response body should be interpreted. Transport-neutral on purpose —
 * `binary` maps to whatever the underlying transport calls it.
 */
export type HttpResponseType = 'json' | 'text' | 'binary';

/** Per-call options, independent of any HTTP library. */
export interface HttpRequestOptions {
    headers?: Record<string, string>;
    /** Query-string parameters. */
    params?: Record<string, unknown>;
    /** Cancels the call — e.g. a request-lifecycle signal. */
    signal?: AbortSignal;
    /** Defaults to `json`. */
    responseType?: HttpResponseType;
}

/** A full request description, for the generic {@link HttpClient.request}. */
export interface HttpRequest extends HttpRequestOptions {
    method?: HttpMethod;
    url: string;
    body?: unknown;
}

/**
 * The client this package hands out.
 *
 * Deliberately **not** an `AxiosInstance`. Axios is an implementation detail of
 * `HttpProviderFactory` — auth, resilience and configuration are already this
 * package's own concerns, so exposing a third-party client's full API as ours
 * would make every consumer depend on it and make the transport impossible to
 * change. This interface is small enough to keep stable.
 *
 * Methods resolve to the **response body**; callers never unwrap an envelope.
 * Reach for {@link raw} only when something genuinely transport-specific is
 * needed.
 */
export interface HttpClient {
    /** Base URL this client was configured with, if any. */
    readonly baseURL: string | undefined;

    get<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T>;
    post<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
    put<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
    patch<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;
    delete<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T>;

    /** Safe, body-carrying lookup — `GET` semantics with a request payload. */
    query<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T>;

    /** Generic escape from the verb helpers, still transport-neutral. */
    request<T = unknown>(request: HttpRequest): Promise<T>;

    /**
     * The underlying transport instance.
     *
     * Present for integrations that must attach interceptors, and for tests that
     * mock the transport. Application code should not reach for it — anything
     * using this is coupled to the current transport.
     */
    readonly raw: unknown;
}
