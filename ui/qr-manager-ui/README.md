# qr-manager-ui

Admin UI for `qr-manager-api`. Create, list, edit, deactivate QR code records and download QR images.

Sign-in is required: an anonymous visitor gets a sign-in page and none of the application. **That is a
usability boundary, not a security one** — `qr-manager-api` does not verify tokens yet, so an
unauthenticated request to it still returns everything.

## API Dependencies

| API | Config key | Operations |
|-----|------------|------------|
| `qr-manager-api` | `apiBaseURL` (runtime config) | Full CRUD on `/qr-codes`, image download |

## Authentication

Authorization code + PKCE against Authentik, as a public client with no secret, via
`@radoslavirha/ui-auth`. The access token is held **in memory only** — there is no refresh token, and a
reload re-obtains one with a top-level `prompt=none` redirect.

**No iframe is used anywhere.** Authentik sets `X-Frame-Options: DENY`, so session recovery, renewal
and SSO are all top-level navigations.

One `Log out` button, and it ends the **IdP** session: you are signed out of every application behind
`auth.irha.cz`, across both clusters and both stages. There is no per-environment logout.

## Runtime Config

Loaded from `/config.json` before React bundle runs. In production: k8s ConfigMap.

| Key | Required | Description |
|-----|----------|-------------|
| `apiBaseURL` | ✓ | Base URL of `qr-manager-api` |
| `basePath` | — | Public sub-path the app is mounted at. Defaults to `/` |
| `auth.issuer` | ✓ | Per-application issuer, **including its trailing slash** |
| `auth.clientId` | ✓ | Authentik application slug, e.g. `qr-manager-server1-sandbox` |
| `auth.scope` | ✓ | Exactly `openid profile email roles` — dropping `roles` silently removes the claim, dropping `profile` turns `aud` into a bare string |
| `auth.redirectUri` | ✓ | Absolute callback URL. Matching at the IdP is strict |
| `auth.postLogoutRedirectUri` | ✓ | Absolute URL returned to after logout |

Nothing here is secret; a public client has none. **The `auth` block is required** — the validating
initContainer refuses to start the pod without it, so a UI can never quietly ship with login disabled.

In `homelab` these values are **templated per deployment** from `VAR_CLUSTER` and `NAMESPACE`, because
one values file serves both clusters. Literals there would point server2 at server1's application.

## Local development

```bash
pnpm dev        # http://localhost:5173
```

`public/config.json` points at the **sandbox** application, and `http://localhost:5173/callback` is a
registered redirect URI there, so local development performs a real login against the real IdP. It is
registered on sandbox only: a loopback redirect URI on a production client would let anything running
on a developer's machine complete a production login.

Before calling any auth change done, verify it in a browser with the **`verify-auth-in-browser`**
skill. Six bugs in this area passed a green test suite.
