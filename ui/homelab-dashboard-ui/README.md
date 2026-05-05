# homelab-dashboard-ui

Visual dashboard for the homelab network. Reads static DNS records from UniFi, groups services by server, and renders clickable tiles per cluster.

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| UniFi Network Application | HTTPS (proxied via nginx) | Fetches static DNS records via `/proxy/network/v2/api/site/{site}/static-dns` |

## Runtime Config

Loaded from `/config.json` before React bundle runs. In production: k8s ConfigMap.

| Key | Required | Description |
|-----|----------|-------------|
| `unifi.host` | ✓ | Base URL of the UniFi controller (e.g. `https://192.168.1.1`) |
| `unifi.apiKey` | ✓ | UniFi API key (`X-Api-Key` header) |
| `unifi.site` | — | Site name, defaults to `default` |
| `title` | — | Browser tab title, defaults to `Homelab Dashboard` |
| `serverPattern` | — | JS regex; capture group 1 = server index. Default: `^server(\d+)\.home$` |
| `scheme` | — | Protocol for tile URLs (`http` or `https`). Default: `http` |
| `exclude` | — | Array of DNS hostnames to hide from the dashboard |
| `paths` | — | Map of hostname/service-name → URL path suffix (e.g. `{ "traefik": "/dashboard" }`) |
