# @radoslavirha/http-provider

Framework-agnostic axios wrapper providing auth-aware, retry-capable `AxiosInstance` objects from a typed, Zod-validated configuration.

## Features

- **Multiple auth strategies**: none, Kubernetes service account, token exchange, JWT self-signed
- **Get/set separation**: auth strategy _gets_ credentials; transport config _sets_ them on requests
- **Placeholder interpolation**: use `{{name}}` in transport values — replaced by credential fields at runtime
- **Static values**: API keys, bearer tokens, or any fixed header/query param go directly in `transport`
- **Resilience policy** integration (retry, circuit breaker, timeout)
- **401 retry** — on a 401 response, credentials are invalidated and one retry is attempted automatically
- **Zero framework dependency** — works in any Node.js 24+ project

## Installation

```bash
pnpm add @radoslavirha/http-provider
```

## Quick Start

```ts
import { HttpProviderFactory, AuthStrategy } from '@radoslavirha/http-provider';

enum ApiKey {
  QRManager = 'qr-manager',
  MiotBridge = 'miot-bridge',
}

const factory = new HttpProviderFactory({
  [ApiKey.QRManager]: { baseURL: 'http://qr-manager.svc.cluster.local' },
  [ApiKey.MiotBridge]: {
    baseURL: 'http://miot-bridge.svc.cluster.local',
    auth: {
      strategy: AuthStrategy.KubernetesServiceAccount,
      transport: {
        headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }],
      },
    },
  },
});

const qrClient = factory.get(ApiKey.QRManager);    // raw AxiosInstance
const bridgeClient = factory.get(ApiKey.MiotBridge);
```

## Config Schema Integration

Use `createProvidersSchema` to embed HTTP provider config inside your own Zod config schema:

```ts
import { createProvidersSchema } from '@radoslavirha/http-provider';

enum ApiKey {
  QRManager = 'qr-manager',
}

const HttpProvidersSchema = createProvidersSchema(Object.values(ApiKey));

const AppConfigSchema = z.object({
  server: z.object({ httpPort: z.number() }),
  providers: HttpProvidersSchema,
});
```

## Usage Examples

### 1. No auth (omit `auth` or explicit `strategy: none`)

```json
{
  "qr-manager": {
    "baseURL": "http://qr-manager.svc.cluster.local"
  }
}
```

### 2. Static API key — query param

```json
{
  "weather-api": {
    "baseURL": "https://api.openweathermap.org",
    "auth": {
      "transport": {
        "queryParams": [{ "name": "appid", "value": "YOUR_API_KEY" }]
      }
    }
  }
}
```

### 3. Static API key — header

```json
{
  "some-api": {
    "baseURL": "https://api.example.com",
    "auth": {
      "transport": {
        "headers": [{ "name": "X-Api-Key", "value": "my-api-key" }]
      }
    }
  }
}
```

### 4. Static Bearer token header

```json
{
  "some-api": {
    "baseURL": "https://api.example.com",
    "auth": {
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer my-static-token" }]
      }
    }
  }
}
```

### 5. Multiple static headers + query params combined

```json
{
  "some-api": {
    "baseURL": "https://api.example.com",
    "auth": {
      "transport": {
        "headers": [
          { "name": "X-Client-Id", "value": "client-abc" },
          { "name": "X-Client-Secret", "value": "secret-xyz" }
        ],
        "queryParams": [{ "name": "version", "value": "2" }]
      }
    }
  }
}
```

### 6. Kubernetes service account — zero config (defaults)

Uses `/var/run/secrets/kubernetes.io/serviceaccount/token` by default.

```json
{
  "internal-api": {
    "baseURL": "http://internal-api.svc.cluster.local",
    "auth": {
      "strategy": "kubernetes-service-account",
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 7. Kubernetes service account — custom token path

```json
{
  "internal-api": {
    "baseURL": "http://internal-api.svc.cluster.local",
    "auth": {
      "strategy": "kubernetes-service-account",
      "tokenPath": "/run/secrets/my-sa/token",
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 8. Token exchange — POST with JSON body

`tokenExtractor` maps a dot-notation path from the response to a named credential.  
The string shorthand `"access_token"` is equivalent to `[{ "field": "access_token", "as": "value" }]`.

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "token-exchange",
      "request": {
        "method": "POST",
        "url": "http://auth.svc.cluster.local/token",
        "body": { "grant_type": "client_credentials", "scope": "read" }
      },
      "tokenExtractor": "access_token",
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 9. Token exchange — GET with Basic Auth header

Static transport on the auth request itself (passed via `headers`/`queryParams` fields at the auth level).

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "token-exchange",
      "request": {
        "method": "GET",
        "url": "http://auth.svc.cluster.local/token",
        "headers": [{ "name": "Authorization", "value": "Basic dXNlcjpwYXNz" }]
      },
      "tokenExtractor": "token",
      "transport": {
        "headers": [{ "name": "X-Token", "value": "{{value}}" }]
      }
    }
  }
}
```

### 10. Token exchange — multiple extracted values

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "token-exchange",
      "request": {
        "method": "POST",
        "url": "http://auth.svc.cluster.local/token",
        "body": {}
      },
      "tokenExtractor": [
        { "field": "access_token", "as": "accessToken" },
        { "field": "token_type", "as": "tokenType" }
      ],
      "transport": {
        "headers": [{ "name": "Authorization", "value": "{{tokenType}} {{accessToken}}" }]
      }
    }
  }
}
```

### 11. JWT self-signed — RS256 from file (minimal)

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "jwt-self-signed",
      "algorithm": "RS256",
      "key": { "source": "file", "path": "/run/secrets/jwt/private.pem" },
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 12. JWT self-signed — HS256 shared secret inline

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "jwt-self-signed",
      "algorithm": "HS256",
      "key": { "source": "value", "value": "my-shared-secret" },
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 13. JWT self-signed — with additional claims

```json
{
  "my-api": {
    "baseURL": "http://my-api.svc.cluster.local",
    "auth": {
      "strategy": "jwt-self-signed",
      "algorithm": "RS256",
      "key": { "source": "file", "path": "/run/secrets/jwt/private.pem" },
      "claims": {
        "iss": "miot-bridge",
        "sub": "miot-bridge",
        "aud": "qr-manager",
        "exp": 900,
        "additionalClaims": { "role": "service" }
      },
      "transport": {
        "headers": [{ "name": "Authorization", "value": "Bearer {{value}}" }]
      }
    }
  }
}
```

### 14. With resilience retry config

Retries are opt-in — set `resilience.retry.count` above `0` to enable retry attempts.

```json
{
  "flaky-api": {
    "baseURL": "http://flaky-api.svc.cluster.local",
    "resilience": {
      "retry": {
        "count": 5,
        "backoffMs": 500
      }
    }
  }
}
```

### 15. Runtime passthrough pattern (no strategy, per-request header)

Omit `auth` and set headers on each request manually when the caller owns the credentials:

```ts
const client = factory.get('some-api');
const response = await client.get('/resource', {
  headers: { Authorization: `Bearer ${callerToken}` },
});
```

## Auth Strategy Reference

| Strategy | Value | Description |
|---|---|---|
| `AuthStrategy.None` | `"none"` | No credential acquisition; transport applies static values only |
| `AuthStrategy.KubernetesServiceAccount` | `"kubernetes-service-account"` | Reads SA token from file; re-reads on invalidation |
| `AuthStrategy.TokenExchange` | `"token-exchange"` | Calls an auth endpoint (GET/POST); caches response |
| `AuthStrategy.JwtSelfSigned` | `"jwt-self-signed"` | Generates a signed JWT locally using `jose`; caches until near expiry |

## Transport Placeholder Interpolation

Strategy credentials are a `Record<string, string>`. Values in `transport.headers` or `transport.queryParams` containing `{{name}}` are replaced with the matching credential field.

For single-value strategies (k8s SA, simple token exchange), the credential is always exposed as `value` → use `{{value}}` in your transport.

For multi-field token exchange, use `as` to name each field → reference by that name in transport.

## Resilience Retry Defaults

| Field | Default |
|---|---|
| `count` | `0` |
| `backoffMs` | `250` ms |

Retry is disabled by default (`count: 0`). Set `resilience.retry.count` to a value greater than `0` to enable retries.
When enabled, retries apply to network errors and HTTP status codes `[500, 502, 503, 504]`.
