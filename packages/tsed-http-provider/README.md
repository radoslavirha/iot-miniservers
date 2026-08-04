# @radoslavirha/tsed-http-provider

Ts.ED wiring for [`@radoslavirha/http-provider`](../http-provider): one injectable
`HttpProviderService` that turns the `externalApis` block of your configuration into
auth-aware, resilient, **logged** `AxiosInstance` objects.

The core package is framework-free and has no logging. This package adds it, using the API's
`Logger` and [`@radoslavirha/redaction`](https://github.com/radoslavirha/toolkit-hub/tree/main/packages/redaction)
— the same split as [`resilience`](../resilience) / [`tsed-resilience`](../tsed-resilience).
`tsed-logger` covers **inbound** request logging; this covers **outbound**.

## 🚀 Quick Reference for AI Agents

```ts
import { InjectHttpClient } from '@radoslavirha/tsed-http-provider';
import type { HttpClient } from '@radoslavirha/http-provider';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecEndpoint {
  @InjectHttpClient(ExternalApi.MiotSpec)
  private readonly client!: HttpClient;

  // base URL, auth, resilience and logging all come from configuration;
  // failures already arrive as 502/503/504
  public async fetchSpec(type: string): Promise<MiotSpecV2DTO> {
    const spec = await this.client.get<object>('/instance', { params: { type } });
    return Serializer.deserialize(spec, MiotSpecV2DTO);
  }
}
```

## Setup

**1. Declare the external APIs as an enum** — values must match the configuration keys.

```ts
// src/models/config/ExternalApi.enum.ts
export enum ExternalApi {
  MiotSpec = 'MIOT_SPEC'
}
```

**2. Add `externalApis` to the config schema.** `createExternalApisSchema` ties it to the enum,
so missing required keys fail at config load rather than at first call. Keep it
**required** — if the service cannot work without its external APIs, an absent block should stop
startup rather than surface as a runtime error on the first request.

Runtime parsing intentionally tolerates unknown extra keys to preserve rolling-deployment
compatibility. This allows config to be prepared ahead of rollout while older pods still run.
As a deployment rule, the whole configuration must remain backward compatible with both the
currently running and next application versions.

```ts
export const ConfigSchema = BaseConfig.extend({
  // required: a missing block should fail at config load, not at first call
  externalApis: createExternalApisSchema(Object.values(ExternalApi)),
  logger: LoggerOptionsSchema.optional()
});
```

**3. Bind the token**, the same way `LoggerProvider` binds `Logger`. Only configuration is
passed — the logger is resolved from the container by the base class:

```ts
// src/providers/HttpProviderProvider.ts
@Injectable({ token: HttpProviderService, scope: ProviderScope.SINGLETON })
export class HttpProviderProvider extends HttpProviderService<ExternalApi> {
  constructor(configService: ConfigService) {
    super(configService.config.externalApis);
  }
}
```

Export it from `providers/index.ts` so Ts.ED registers it. Do **not** also add a bare
`@Injectable()` — `@Injectable({ token })` already replaces the provider.

**4. Configure**, in `config/*.json`:

```json
{
  "externalApis": {
    "MIOT_SPEC": {
      "baseURL": "https://miot-spec.org/miot-spec-v2",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    }
  }
}
```

Base URLs, auth, resilience and logging all live in configuration — services hold only relative
paths.

## Endpoint services

An endpoint service wraps one external API. There is no base class and no custom client — two
narrow mechanisms, each doing one job:

| Concern | Mechanism |
|---|---|
| Client resolution | `@InjectHttpClient(key)` — Ts.ED `@Inject` with a transform |
| Failure translation | Response interceptor, attached to every configured client |

```ts
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecV2Endpoint {
  @InjectHttpClient(ExternalApi.MiotSpec)
  private readonly client!: HttpClient;

  public async fetchSpec(type: string): Promise<MiotSpecV2DTO> {
    const spec = await this.client.get<object>('/instance', { params: { type } });
    return Serializer.deserialize(spec, MiotSpecV2DTO);
  }
}
```

No constructor, no try/catch, and no HTTP library named in application code. The client is the
plain `HttpClient` from `@radoslavirha/http-provider` — standard `get`/`post`/`put`/`patch`/
`delete`/`request`, nothing invented on top.

**Deserialization is not this package's job.** Endpoints map bodies to DTOs with `Serializer`
from `@radoslavirha/tsed-common`, the same utility used everywhere else in the codebase. An HTTP
provider provides HTTP clients; model mapping is a separate concern and stays at the call site.

### Failure translation

An unreachable dependency is a failure of **this** service, so upstream statuses are never
passed through:

| Cause | Becomes |
|---|---|
| Circuit open (`BrokenCircuitError`) | `ServiceUnavailable` — 503 |
| Timeout or cancellation (`TaskCancelledError`) | `GatewayTimeout` — 504 |
| Upstream returned an error status | `BadGateway` — 502 |
| Upstream unreachable (network error) | `BadGateway` — 502 |

Messages name the API (`External API "MIOT_SPEC" responded with 503.`) and the original error is
kept as `origin`, so a caller that cares about the upstream status can still narrow:

```ts
try {
  return await this.endpoint.fetchSpec(type);
} catch (error) {
  if (error.origin?.response?.status === 404) throw new NotFound(`Spec ${type} not found.`);
  throw error;
}
```

Translation is attached **after** the auth interceptor, not through the `onInstanceCreated`
seam — that seam runs first, so a `401` would become a `BadGateway` before the auth retry ever
saw it.

Endpoints do **not** log; `HttpProviderService` already logs every outbound exchange including
failures, so logging again would duplicate lines.

## Logging

Every outbound call emits one line, scoped per API (`HTTP_CLIENT:MIOT_SPEC`), shaped like the
inbound entries from `@radoslavirha/tsed-logger`:

```json
{
  "scope": "HTTP_CLIENT:MIOT_SPEC",
  "body": "Request completed",
  "provider": "MIOT_SPEC",
  "method": "GET",
  "url": "/instance",
  "status": 200,
  "duration": 148,
  "headers": "{\"authorization\":\"***\"}",
  "query": "{\"type\":\"urn:...\"}",
  "response": "{\"type\":\"urn:...\"}"
}
```

The token-exchange auth call is logged too, under `<key>:auth`.

Since `HttpInstrumentation` is enabled via `@radoslavirha/otel`, these lines carry the
`trace_id` of the outbound span — Grafana links the log row straight to the trace.

### Options (`logging`, per entry)

| Field | Default | Meaning |
|---|---|---|
| `enabled` | `true` | Disable logging for this API. |
| `headers` | on, auth redacted | Request headers as actually sent. |
| `query` | on | Query-string parameters. |
| `request` | on | Outgoing request payload. |
| `response` | on | Response payload; non-textual bodies log as `[[ BINARY ]]`. |
| `stack` | `true` | Include `error_stack` on failures. |

Each section takes `{ enabled, redactPaths }` — the shared vocabulary from
`@radoslavirha/redaction`, identical to `tsed-logger`'s inbound `requests` section. Redactors
are compiled **once per API**, never per request.

```json
{
  "auth-api": {
    "baseURL": "https://auth.example.com",
    "logging": {
      "request": { "redactPaths": ["client_secret"] },
      "response": { "redactPaths": ["access_token", "refresh_token"] }
    }
  }
}
```

Selectors: `authorization` (root), `user.password` (nested), `items.*.token` (wildcard),
`["set-cookie"]` (**required** bracket form for hyphenated names).

### What is redacted by default

`headers.redactPaths` defaults to `authorization`, `Authorization`, `cookie`, `Cookie`,
`["set-cookie"]`, `["proxy-authorization"]`. This deliberately differs from `tsed-logger`'s
empty default: an **outbound** request carries credentials the provider itself injected, so
logging them unredacted would leak your own secrets.

Payloads, query strings and responses are **not** redacted by default — list sensitive paths
per API.

### Implementation notes

- Logging attaches through the core factory's `onInstanceCreated` seam, so it observes a raw
  `401` before the auth retry recovers it. One line per real exchange: a failure for the `401`
  and a success for the replay, rather than the `401` vanishing and the replay logged twice.
- Headers, query and payload are captured in the request interceptor, because axios runs
  `transformRequest` afterwards and `config.data` would already be a serialised string by
  response time.
- `duration` covers the whole exchange including resilience retries.

## API

| Export | Purpose |
|---|---|
| `InjectHttpClient(key)` | Property decorator injecting the `HttpClient` for one configured API. |
| `HttpProviderService<K>` | Injectable factory wrapper. `get(key)` returns the cached `HttpClient`; throws for an unconfigured key. |
| `attachErrorTranslation` | The failure-translation interceptor, for wiring outside the service. |
| `createExternalApisSchema(keys)` | Zod schema for the `externalApis` config block, constrained to your enum. |
| `ExternalApiEntrySchema` | One entry: core provider fields plus `logging`. |
| `attachRequestLogging` | The interceptor itself, for wiring outside the service. |
| `HttpLogConfigSchema` | The `logging` section schema. |
