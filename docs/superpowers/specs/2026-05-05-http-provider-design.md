# HTTP Provider Package — Design Spec

> **Status:** Approved for implementation

## Goal

A framework-agnostic TypeScript package (`@radoslavirha/http-provider`) that provides auth-aware, retry-capable `AxiosInstance` objects from a typed Zod-validated configuration. Consumers `getProvider(ApiKey.QRManager)` and get a fully configured `AxiosInstance`.

## Architecture

### Get / Set separation

- **Get** (`strategy`) — how to acquire a dynamic credential: `none`, `kubernetes-service-account`, `token-exchange`, `jwt-self-signed`
- **Set** (`transport`) — how to inject values into requests: `headers[]` and/or `queryParams[]`. Static transport = literal values. Dynamic transport = `{{name}}` placeholder replaced with credential.

### Transport values

- `headers`: array of `{ name, value }` — static string or `{{credentialName}}`
- `queryParams`: array of `{ name, value }` — same

### Auth strategies

| Strategy | Fields | Credential key |
|---|---|---|
| `none` | — | — |
| `kubernetes-service-account` | optional `tokenPath` (default: `/var/run/secrets/kubernetes.io/serviceaccount/token`) | `{{value}}` |
| `token-exchange` | `request` (method/url/headers/queryParams/body), `tokenExtractor` | named: `{{accessToken}}` etc, or shorthand string → `{{value}}` |
| `jwt-self-signed` | `key` (source: file\|value), `algorithm` (RS256\|ES256\|HS256), `claims` | `{{value}}` |

`tokenExtractor` shorthand: `"access_token"` → `[{ field: "access_token", as: "value" }]`

### Retry

Uses `axios-retry`. Configurable per provider entry, with defaults:
- `count: 3`, `delay: 1000` (exponential), `statusCodes: [500, 502, 503, 504]`

### 401 handling

Response interceptor on each instance:
- On 401, call `strategy.invalidate()`, re-acquire credentials, retry original request once (guarded by `_retried` flag)

### Factory

`HttpProviderFactory<K extends string>` — lazy-creates and caches `AxiosInstance` per key.

## Package structure

```
packages/http-provider/
  src/
    index.ts
    HttpProviderFactory.ts
    types.ts
    schemas/
      transport.schema.ts
      retry.schema.ts
      auth.schema.ts
      provider.schema.ts
      providers.schema.ts
    strategies/
      IAuthStrategy.ts
      NoAuthStrategy.ts
      KubernetesServiceAccountStrategy.ts
      TokenExchangeStrategy.ts
      JwtSelfSignedStrategy.ts
    utils/
      applyTransport.ts
      extractByPath.ts
```

## Public API

```ts
export { HttpProviderFactory } from './HttpProviderFactory.js';
export { AuthStrategy } from './schemas/auth.schema.js';
export { HttpProvidersConfigSchema, createProvidersSchema } from './schemas/providers.schema.js';
export type { HttpProvidersConfig, HttpProviderEntry, TransportConfig, ... } from './types.js';
```

## Defaults

| Field | Default |
|---|---|
| `auth.strategy` | `none` |
| `kubernetes-service-account.tokenPath` | `/var/run/secrets/kubernetes.io/serviceaccount/token` |
| `kubernetes-service-account.transport` | `{ headers: [{ name: "Authorization", value: "Bearer {{value}}" }] }` |
| `jwt-self-signed.algorithm` | `RS256` |
| `jwt-self-signed.claims.exp` | `3600` |
| `jwt-self-signed.transport` | `{ headers: [{ name: "Authorization", value: "Bearer {{value}}" }] }` |
| `token-exchange.request.method` | `POST` |
| `retry.count` | `3` |
| `retry.delay` | `1000` |
| `retry.statusCodes` | `[500, 502, 503, 504]` |
