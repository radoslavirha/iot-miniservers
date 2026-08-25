# homelab-dashboard-ui

Visual dashboard for the homelab network. Reads static DNS records from UniFi, groups services by server, and renders clickable tiles per cluster.

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| UniFi Network Application | HTTPS (proxied via nginx) | Fetches static DNS records via `/proxy/network/v2/api/site/{site}/static-dns` |

## Runtime Config

Loaded from `/config.json` before React bundle runs. In production: k8s ConfigMap.

`config.json` is served to the browser, so **it must never contain a credential**. The UniFi key and
host are server-side environment variables instead — see [Server-side environment](#server-side-environment).

| Key | Required | Description |
|-----|----------|-------------|
| `unifi.site` | — | Site name, defaults to `default` |
| `title` | — | Browser tab title, defaults to `Homelab Dashboard` |
| `serverPattern` | — | JS regex; capture group 1 = server index. Default: `^server(\d+)\.home$` |
| `scheme` | — | Protocol for tile URLs (`http` or `https`). Default: `http` |
| `exclude` | — | Array of DNS hostnames to hide from the dashboard |
| `paths` | — | Map of hostname/service-name → URL path suffix (e.g. `{ "traefik": "/dashboard" }`) |

## Server-side environment

Consumed by nginx, never sent to the browser. `docker-entrypoint.d/10-require-unifi-env.sh` refuses to
start the container if either is empty — the validating initContainer cannot see them, so this is where
that fail-fast property lives.

| Variable | Description |
|----------|-------------|
| `UNIFI_HOST` | Base URL of the UniFi controller (e.g. `https://192.168.1.1`). Used by `proxy_pass`. |
| `SECRET_UNIFI_API_KEY` | UniFi API key. Attached by `proxy_set_header X-Api-Key`, which also overrides any client-supplied value. |

> **`nginx -T` prints the rendered config, API key included.** Do not paste that output into an issue
> or a chat log.

## Local development

Put the two values in `ui/homelab-dashboard-ui/.env.local` (gitignored):

```sh
UNIFI_HOST=https://192.168.1.1
UNIFI_API_KEY=your-real-key
```

`vite.config.ts` reads them with `loadEnv` and injects the header in the dev proxy, so development
matches production: the browser holds no credential in either. They are intentionally not `VITE_`
prefixed — that would bundle them into the client.
