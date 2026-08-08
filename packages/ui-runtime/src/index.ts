/**
 * Browser-safe entry point.
 *
 * The Node-side validator lives behind `@radoslavirha/ui-runtime/validator` so
 * that `node:fs` and `process` never enter a browser bundle, and so consumers
 * of this entry do not need Node type definitions to type-check.
 */
export { loadRuntimeConfig } from './config/loadRuntimeConfig.js';
export { RuntimeConfigError } from './config/errors.js';
export { httpUrl, absolutePath, stripTrailingSlash } from './config/schema-helpers.js';
export { statusForOutcome } from './status/ApiStatus.js';
export { classifyResponse, classifyError } from './status/classifyResponse.js';
export { useApiStatus } from './status/useApiStatus.js';

export type { LoadRuntimeConfigOptions } from './config/loadRuntimeConfig.js';
export type { RuntimeConfigErrorReason } from './config/errors.js';
export type { ApiStatus, RequestOutcome } from './status/ApiStatus.js';
export type { RecoveryProbeOptions, UseApiStatusOptions, UseApiStatusResult } from './status/useApiStatus.js';
