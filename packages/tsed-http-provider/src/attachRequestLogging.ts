import type { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ObjectUtils } from '@radoslavirha/utils';
import { RedactionProfile } from '@radoslavirha/redaction';
import type { ResolvedHttpLogConfig } from './logging.schema.js';
import type { BaseLogger } from '@radoslavirha/tsed-logger';

/** Scope pinned on every outbound log line, mirroring inbound's `HTTP_REQUEST`. */
export const HTTP_CLIENT_LOG_SCOPE = 'HTTP_CLIENT';

/** Redactable sections of an outbound exchange. */
type LogSection = 'headers' | 'query' | 'request' | 'response';

/** Content types whose bodies are safe to serialise into a log line. */
const TEXTUAL_CONTENT_TYPE =
    /^(text\/|application\/(json|xml|ld\+json|graphql|javascript|x-www-form-urlencoded))/i;

/** Placeholder logged in place of a non-textual (binary) payload. */
const BINARY_PLACEHOLDER = '[[ BINARY ]]';

interface LoggedRequestConfig extends InternalAxiosRequestConfig {
    _logStartedAt?: number;
    _logCaptured?: Partial<Record<LogSection, string>>;
}

interface LoggedError {
    name?: string;
    code?: string;
    message?: string;
    stack?: string;
    config?: LoggedRequestConfig;
    response?: AxiosResponse;
}

/**
 * Logs one line per outbound request, shaped like the inbound entries emitted by
 * `@radoslavirha/tsed-logger`'s `$onResponse`: `method`, `url`, `status` and
 * `duration`, plus the redacted `headers`, `query`, `request` and `response`.
 *
 * The **message** deliberately differs from inbound's `Request completed`: the
 * two would otherwise be indistinguishable in Grafana without also filtering on
 * `scope`. It names the direction and the transport, so a future non-HTTP client
 * (gRPC, MQTT) gets its own message rather than overloading this one.
 *
 * Values are sanitised through a {@link RedactionProfile} **before** reaching the
 * logger, which stays a pure transport. The profile is built once here — per
 * provider — because `fast-redact` compiles its redactors and doing that per
 * request would dominate the cost of logging.
 *
 * Headers, query and payload are captured in the **request** interceptor rather
 * than read back off the response: axios runs `transformRequest` after the
 * interceptor chain, so by response time `config.data` has already been
 * serialised to a string and redaction could no longer reach into it. Capturing
 * early also records exactly what went on the wire, auth headers included.
 */
export function attachRequestLogging(
    instance: AxiosInstance,
    logger: BaseLogger,
    config: ResolvedHttpLogConfig,
    providerKey: string
): void {
    if (!ObjectUtils.isEnabled(config)) {
        return;
    }

    const redaction = new RedactionProfile<LogSection>({
        headers: config.headers,
        query: config.query,
        request: config.request,
        response: config.response
    });

    instance.interceptors.request.use((requestConfig: LoggedRequestConfig) => {
        requestConfig._logCaptured = redaction.collect({
            headers: requestConfig.headers,
            query: requestConfig.params,
            request: requestConfig.data
        });
        requestConfig._logStartedAt = Date.now();
        return requestConfig;
    });

    const buildMeta = (
        requestConfig: LoggedRequestConfig | undefined,
        response: AxiosResponse | undefined
    ): Record<string, unknown> => {
        const meta: Record<string, unknown> = {
            provider: providerKey,
            method: requestConfig?.method?.toUpperCase(),
            url: resolveUrl(requestConfig),
            status: response?.status,
            duration: requestConfig?._logStartedAt === undefined
                ? undefined
                : Date.now() - requestConfig._logStartedAt,
            ...requestConfig?._logCaptured
        };

        if (redaction.isEnabled('response')) {
            const contentType = extractContentType(response);
            meta['response'] = isTextualContentType(contentType)
                ? redaction.redact('response', response?.data)
                : BINARY_PLACEHOLDER;
        }

        return meta;
    };

    instance.interceptors.response.use(
        (response) => {
            logger.info('Upstream HTTP request completed', buildMeta(response.config, response));
            return response;
        },
        (error: unknown) => {
            const failure = error as LoggedError;
            logger.error('Upstream HTTP request failed', {
                ...buildMeta(failure.config, failure.response),
                error_name: failure.name ?? failure.code,
                error_message: failure.message,
                ...(config.stack ? { error_stack: failure.stack } : {})
            });
            return Promise.reject(error);
        }
    );
}

/** An absolute URL: has a scheme, or is protocol-relative (`//host/path`). */
const ABSOLUTE_URL = /^([a-z][a-z\d+\-.]*:)?\/\//i;

/**
 * Joins `baseURL` with the per-request `url`, mirroring how axios builds the
 * path it actually requests. Axios keeps the two apart on the config until the
 * adapter runs, so logging `config.url` alone yields a bare path with no host.
 *
 * A `url` that is already absolute wins over `baseURL`, matching axios.
 */
function resolveUrl(requestConfig: LoggedRequestConfig | undefined): string | undefined {
    const url = requestConfig?.url;
    const baseURL = requestConfig?.baseURL;

    if (url === undefined || url === '') {
        return baseURL;
    }

    if (baseURL === undefined || baseURL === '' || ABSOLUTE_URL.test(url)) {
        return url;
    }

    return `${baseURL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`;
}

/** Whether a payload of this content type is safe to serialise into a log line. */
function isTextualContentType(contentType: string | undefined): boolean {
    return !contentType || TEXTUAL_CONTENT_TYPE.test(contentType);
}

/**
 * Reads the response content type. Axios normalises header casing on responses,
 * but a bare object from a custom adapter may not, so both spellings are tried.
 */
function extractContentType(response: AxiosResponse | undefined): string | undefined {
    const headers = response?.headers as Record<string, unknown> | undefined;
    const value = headers?.['content-type'] ?? headers?.['Content-Type'];
    return value === undefined ? undefined : String(value);
}
