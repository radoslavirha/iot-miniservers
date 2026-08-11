export { HttpProviderService } from './HttpProviderService.js';
// Re-exported so consumers need only this package — the core is an implementation detail.
export type {
    HttpClient,
    HttpMethod,
    HttpRequest,
    HttpRequestOptions,
    HttpResponseType
} from '@radoslavirha/http-provider';
// Owned by @radoslavirha/resilience, which owns cockatiel.
export { CircuitState } from '@radoslavirha/resilience';
export type { CircuitStateLike } from '@radoslavirha/resilience';
export { InjectHttpClient } from './InjectHttpClient.js';
export { attachErrorTranslation } from './attachErrorTranslation.js';
export { HTTP_CLIENT_LOG_SCOPE, attachRequestLogging } from './attachRequestLogging.js';
export {
    ExternalApiEntrySchema,
    createExternalApisSchema
} from './externalApi.schema.js';
export type { ExternalApiEntry, ResolvedExternalApiEntry } from './externalApi.schema.js';
export { HttpLogConfigSchema, DEFAULT_HEADER_REDACT_PATHS } from './logging.schema.js';
export type { HttpLogConfig, ResolvedHttpLogConfig } from './logging.schema.js';
