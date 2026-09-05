# `homelab-dashboard-ui` — Move the Unifi Credential Behind nginx

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Repo:** `/Users/radoslavirha/dev/irha/iot-miniservers`.

**Goal:** the Unifi API key stops being served to the browser. nginx attaches it to the proxied request instead, and `config.json` becomes a file that is genuinely safe to serve publicly.

**Size:** one nginx directive, one entrypoint guard, a schema shrink, and three small source edits. One file is deleted. No new dependencies, no new server.

**Related:**

| Doc | Repo | Relationship |
| --- | --- | --- |
| [`specs/2026-08-06-iot-app-health-checks-frontend.md`](./2026-08-06-iot-app-health-checks-frontend.md) | this repo | Built the config-validation machinery this changes the shape of |
| [`specs/2026-08-08-nginx-ipv6-listener.md`](./2026-08-08-nginx-ipv6-listener.md) | this repo | Touches the same four nginx files. Independent, but land one before starting the other |
| [`plans/2026-08-25-dashboard-credential-boundary-homelab.md`](../../../../homelab/docs/superpowers/plans/2026-08-25-dashboard-credential-boundary-homelab.md) | `homelab` | Values changes. Written 2026-08-25 after implementation; step 1 of its rollout gate is applied |

---

## The problem

`homelab-dashboard-ui`'s `config.json` contains `unifi.apiKey`, rendered from the `homelab-dashboard-ui-unifi-credentials` secret. nginx serves that file at `/config.json`. **Anyone who can open the dashboard can read the Unifi API key** — view-source, devtools, or `curl`.

The browser then sends it back as an `X-Api-Key` header, and nginx forwards it to the controller:

```ts
// src/lib/unifi.ts
const headers: Record<string, string> = { 'X-Api-Key': apiKey };
const res = await fetch(`/proxy/network/v2/api/site/${site}/static-dns`, { headers });
```

Blast radius is small — LAN-only dashboard — but it is a real credential exposure, and it is a property of the architecture rather than a misconfiguration.

### Why it exists, and why it is fixable without a server

A browser is an untrusted execution environment: anything it can read, a user can read. Build-time env var, runtime config file, injected script — all equally public. So a secret cannot be given to a frontend at all; it has to live at the first **server-side hop**, with the browser calling that hop same-origin. That pattern is Backend-for-Frontend (BFF).

The rest of this repo already does that — the Ts.ED APIs *are* the BFF for their UIs. The dashboard is the exception: no business logic to host, so no server was written, and the credential ended up in the browser because there was nowhere else to put it.

But the hop already exists:

```nginx
location /proxy/network/ {
    proxy_pass ${UNIFI_HOST}/proxy/network/;
}
```

nginx is the server-side hop. It simply is not the one holding the credential. Moving one header there **is** the BFF pattern, implemented at the proxy because there is no logic to justify a process. No Node, no framework, no migration.

---

## The configuration split

| Value | Consumer | Where it lives after |
| --- | --- | --- |
| `title`, `serverPattern`, `scheme`, `exclude`, `paths` | browser (display logic) | `config.json` — unchanged |
| `unifi.site` | browser (path segment) | `config.json` — not a secret |
| `unifi.apiKey` | **nginx** | `SECRET_UNIFI_API_KEY` env, never leaves the pod |
| `unifi.host` | **nginx** (`proxy_pass`) | `UNIFI_HOST` env |

`config.json` ends up containing nothing an attacker gains from. That is the point: it is served publicly, so it should be publicly safe by construction rather than by luck.

---

## Key decisions

### 1. nginx attaches the header, not a Node BFF

```nginx
location /proxy/network/ {
    proxy_pass ${UNIFI_HOST}/proxy/network/;
    proxy_set_header X-Api-Key "${SECRET_UNIFI_API_KEY}";
}
```

`proxy_set_header` **replaces** any client-supplied value, so this also stops a browser injecting its own key through the proxy — a small hardening bonus over merely not sending one.

A real BFF (Fastify, Hono) is the right answer when the server must *do* something: OAuth code exchange, session cookies, token refresh, per-user authorization, response shaping. Attaching one fixed header is none of those. Adding a framework here would be résumé-driven design, and it would put a Node runtime back in the serving image — the exact cost rejected in the health-check spec's decision 2.

### 2. `unifi.host` leaves the browser entirely

It is currently used in exactly one place, and not for making requests:

```ts
message: `Connecting to ${config.unifi.host}…`
```

All requests are relative (`/proxy/network/...`), so the browser never needs the controller's address. Displaying it also puts infrastructure detail on a screen, which the health-check spec's rule 3 argues against for the same reason. Replace with `Connecting to the Unifi controller…`.

Consequence worth noticing: `UNIFI_HOST` is currently *derived from `config.json`* by `docker-entrypoint.d/10-derive-unifi-host.envsh`, which exists only to `jq` the value out. Once it is a plain env var, **that hook is dead code and gets deleted.**

### 3. The validator loses coverage, so the guard has to move

This is the non-obvious part, and skipping it would quietly undo work the previous spec just finished.

Today `apiKey` lives in `config.json`, so the Zod schema covers it: an empty `{{ SECRET_UNIFI_API_KEY }}` substitution fails the validating initContainer and the pod never starts. Move the key to an env var and **the validator can no longer see it**. An empty secret would boot happily and 401 on every request — silent breakage, which is precisely the failure mode the health-check work exists to eliminate.

So the fail-fast property moves to an entrypoint guard: `UNIFI_HOST` and `SECRET_UNIFI_API_KEY` must be non-empty or the container refuses to start. This also absorbs what the deleted derive hook was doing for `UNIFI_HOST`.

Keep it **app-specific**, in `ui/homelab-dashboard-ui/docker-entrypoint.d/`. `packages/nginx-runtime` must stay schema- and app-agnostic — that rule is why the shared guard only checks "exists and parses as JSON". If a second UI ever needs required-env checking, generalise it then with a `REQUIRED_ENV` variable; today that would be one consumer and a values-file surface for nothing.

### 4. The secret is in the rendered nginx config — that is fine, with one caveat

`envsubst` writes the key into `/etc/nginx/conf.d/default.conf` at container start. Anyone who can `kubectl exec` into the pod can read it — the same trust boundary as an env var, and incomparably better than serving it to every browser.

The caveat is operational: **`nginx -T` prints the full config including the key.** Anyone debugging should know that output is sensitive. Note it in the app README so it is not pasted into an issue.

### 5. Dev stops carrying a real key in a committed file

Today `vite.config.ts` reads the host out of `public/config.json`, and the browser sends the key — so a developer puts a **real** key into `public/config.json`, a file that **is committed** (currently with a `your-api-key-here` placeholder). That is an invitation to commit a credential.

After the change the dev proxy injects the header itself, from a gitignored local env file, matching production's shape: in both cases the browser never holds the key.

---

## Steps

### 1. nginx

- [x] `ui/homelab-dashboard-ui/nginx.conf.template` — add `proxy_set_header X-Api-Key "${SECRET_UNIFI_API_KEY}";` to the `/proxy/network/` location, with a comment that the credential is deliberately server-side and that `proxy_set_header` also overrides any client-supplied value.
- [x] `ui/homelab-dashboard-ui/nginx.conf` — the static fallback has no `/proxy/network/` block and needs none; confirm rather than assume, and leave a comment saying the fallback is for bare `docker run` and does not proxy.

### 2. The env guard

- [x] Delete `ui/homelab-dashboard-ui/docker-entrypoint.d/10-derive-unifi-host.envsh`.
- [x] Add `ui/homelab-dashboard-ui/docker-entrypoint.d/10-require-unifi-env.sh`:

```sh
#!/bin/sh
# UNIFI_HOST and SECRET_UNIFI_API_KEY are consumed by the nginx template
# (proxy_pass and proxy_set_header). They are NOT in config.json, so the
# validating initContainer cannot check them — this is where that fail-fast
# property lives for them instead.
#
# Never print the values.
set -eu

fatal() { echo "[homelab-dashboard-ui] FATAL: $*" >&2; exit 1; }

[ -n "${UNIFI_HOST:-}" ] || fatal "UNIFI_HOST is empty — set it in the app's env: block."
[ -n "${SECRET_UNIFI_API_KEY:-}" ] || fatal "SECRET_UNIFI_API_KEY is empty — check the secretRef and that ESO synced it."

echo "[homelab-dashboard-ui] Unifi proxy configuration present"
```

- [x] `Dockerfile` — update the `COPY` and `chmod` for the renamed hook.
- [x] Numbering: it must run **before** `20-envsubst-on-templates.sh`, which is what substitutes both values into the template. `10-` keeps that.

### 3. Schema and browser code

- [x] `src/runtime/RuntimeConfig.ts` — drop `unifi.host` and `unifi.apiKey` from `AppConfigSchema`. `unifi` reduces to `{ site }`; keep it nested rather than flattening, so the values files and `config.example.json` change shape as little as possible.
- [x] `src/lib/unifi.ts` — remove the `X-Api-Key` header and the `apiKey` destructure. `fetchDnsRecords` keeps `site`.
- [x] `src/App.tsx` — status message loses the host: `Connecting to the Unifi controller…`.
- [x] `src/App.tsx` — the `UnifiAuthError` guidance currently says "Check `unifi.apiKey` in config.json", which becomes wrong. It is now a server-side secret: point at the secret and the proxy instead.
- [x] `public/config.json` and `public/config.example.json` — remove both fields.

### 4. Dev proxy

- [x] `vite.config.ts` — replace `unifiHost()` (which reads `public/config.json`) with `loadEnv`, and inject the header in the proxy so dev matches production:

```ts
const env = loadEnv(mode, process.cwd(), '');
const proxy = {
    '/proxy/network': {
        target: env.UNIFI_HOST ?? 'https://192.168.1.1',
        changeOrigin: true,
        secure: false,
        // Same shape as production: the browser never holds the key.
        headers: { 'X-Api-Key': env.UNIFI_API_KEY ?? '' }
    }
};
```

  - `defineConfig` must take the function form to receive `mode`.
- [x] `.gitignore` — it currently ignores `.env` but **not** `.env.local` or `.env.*.local`. Add them before telling anyone to put a key there.
- [x] `ui/homelab-dashboard-ui/README.md` — document the two dev variables and that `public/config.json` must never contain a credential again.

### 5. Tests

- [x] `src/lib/unifi.spec.ts` — invert the credential assertion: the request must be made **without** an `X-Api-Key` header. A test that fails if the browser starts sending a credential again is the durable guard here.
- [x] `src/runtime/RuntimeConfig.spec.ts` — drop the `unifi.host` / `unifi.apiKey` cases; add one asserting a config containing a stray `apiKey` still parses (Zod strips unknown keys), because that is what makes the rollout ordering below safe.
- [x] `src/App.spec.tsx` — fixtures built via `AppConfigSchema.parse()` already, so they follow the schema; update the status-message assertion.

---

## Verification

> Ticked items were verified locally on 2026-08-25. The unticked ones need a
> running deployment or a built image and are gated on the rollout below.

- [x] **The key is not served.** `curl http://<dashboard>/config.json` — no `apiKey`, no `host`. Grep the built `dist/` for the key value too: `grep -r "$KEY" dist/` → nothing.
- [ ] **The proxy still works.** Load the dashboard; DNS records render. In devtools, the request to `/proxy/network/...` carries **no** `X-Api-Key` from the browser.
- [ ] **The upstream still gets it.** Records rendering *is* the proof, since Unifi 401s without a valid key.
- [x] **Fail-fast on a missing secret.** Run the image with `SECRET_UNIFI_API_KEY` unset → container exits non-zero naming the variable, value not echoed. Repeat for `UNIFI_HOST`.
- [ ] **No leak in logs.** `docker logs` and `kubectl logs` contain neither value. Plant a sentinel key in a local run and grep for it.
- [ ] **Dev parity.** `pnpm dev` with `.env.local` set works, and the browser request carries no key.

---

## Rollout — single coordinated change

> **Superseded 2026-08-25.** This section originally specified a three-step ordering to keep the
> rollout backward compatible. The repo owner has since ruled that **backwards compatibility is not
> required here and brief downtime is acceptable**, so the gate is dropped. The original reasoning is
> preserved below because it is still correct about *why* the ordering existed.

Values and image tag apply together in one ArgoCD sync: the `env: UNIFI_HOST` block, the removal of
`unifi.host` / `unifi.apiKey` from `templates.config.content`, and the `image.tag` bump.

**The accepted risk:** if Reloader restarts the old pod after the ConfigMap changes but before the new
image is running, the old validating initContainer rejects a config with no `unifi.apiKey` and that pod
will not start. It fails closed rather than serving something broken. This is understood and accepted.

**This change is what closes the exposure — not the tag bump.** The ConfigMap holds only the
`{{ SECRET_UNIFI_API_KEY }}` placeholder; jinja-init renders the real value into an emptyDir that nginx
serves as `/config.json`. So until `templates.config.content` loses the field, nginx keeps serving the
key regardless of which image is running.

- [ ] Rotate the Unifi API key afterwards. It has been readable by anything that could reach the dashboard, so the old value should be considered disclosed regardless of who actually looked.

<details>
<summary>Original three-step ordering (no longer required)</summary>

`AGENTS.md` is explicit: *"Treat configuration as a versioned contract... All config changes must be
backward compatible for rolling deployments... Assume a new ConfigMap can be applied before all old pods
are replaced."* Under that rule this change had both an old and a new contract, so it needed three steps:

1. **Add `UNIFI_HOST` to the app's `env:` in the values file.** Harmless to the running old image.
2. **Bump `image.tag`.** The new image needs the env vars — now present. `config.json` still carries the
   old fields; Zod strips unknown keys, so the new validator accepts it.
3. **Only then remove `unifi.host` and `unifi.apiKey`** from `templates.config.content`.

Doing 3 before 2 breaks the old pod: the old validator still requires `apiKey`, so the pod fails init.
It fails closed — the old pod keeps serving — but it stalls the rollout.

The app-side property that made this safe still holds and is still worth keeping: the new schema strips
unknown keys, so the new image runs against either config shape. That is asserted by a test in
`src/runtime/RuntimeConfig.spec.ts`.

</details>

## Homelab hand-off

**A homelab spec must be written after this is implemented, not before** — the values changes depend on the exact env-var names and the schema shape this work settles, and writing it early would just have to be rewritten.

It needs to cover:

- `gitops/helm-values/server3/homelab-dashboard-ui.yaml` gains an `env:` block with `UNIFI_HOST` (the app has none today).
- `templates.config.content` loses `unifi.host` and `unifi.apiKey`.
- `secretRefs` stays exactly as it is — but its role changes: today `SECRET_UNIFI_API_KEY` is consumed by the **jinja-init** container to substitute into `config.json`; afterwards it is consumed by the **main nginx** container via `envFrom`. Both already work, so no chart change; the plan should say so explicitly, because "the secret moved" invites someone to go looking for a chart edit that isn't needed.
- The three-step ordering above, as a gate.
- Whether the validating initContainer's `validate: true` stays meaningful — it does: `config.json` still has required fields (`serverPattern`, `scheme`, `site`), so the schema still catches an empty substitution. It simply no longer covers the credential, which is what the entrypoint guard replaces.

---

## Release

- [x] Changeset: **minor** for `homelab-dashboard-ui` — the runtime config contract changes, which is more than a patch even though no browser-visible behaviour moves.
- [x] `pnpm run verify`.
- [ ] The dashboard has **no sandbox**; its tag bump rolls the live dashboard on server3. The env guard means a missing variable fails init rather than serving a broken page, so with `maxUnavailable: 0` the old pod keeps serving — but watch the first rollout.

---

## Out of scope

- **Authentication for the dashboard itself.** Nothing authenticates a visitor today; fixing the key exposure does not change that — a visitor would simply use the proxy instead of the key. The standard answer is an identity-aware proxy (oauth2-proxy / Authelia / Authentik behind Traefik forward-auth). Separate concern, already planned separately.
- **`qr-manager-ui`.** Its config holds no credential — only `apiBaseURL` and `basePath`, both public by nature. Nothing to move.
- **Restricting `/proxy/network/` to the endpoints the app uses.** The proxy currently forwards any path under that prefix with the key attached, so a visitor can call *any* Unifi Network API through it. Narrowing it to the one `static-dns` endpoint would be a genuine hardening step, and is a better follow-up than it looks — but it is a separate change and belongs with the authentication work.
