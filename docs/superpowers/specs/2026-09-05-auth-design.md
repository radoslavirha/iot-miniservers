# Auth design and work packages

**Status 2026-09-08: every HTTP API in this repo enforces.** Tracks A, B and C are done. What is left
is not onboarding — it is a release (nothing has shipped), the device credential the LaskaKit map does
not hold yet, and authorization.

**Read [`2026-09-04-authentik-integration-contract.md`](./2026-09-04-authentik-integration-contract.md)
first.** It is the authority for every concrete IdP fact — endpoints, `client_id`s, claims, traps.
This document is the other half: what is left, and the design decisions a new caller has to fit into.

*Trimmed 2026-09-07. The P1.F/P1.0–P1.6 unit plans, the mode-vs-no-mode argument and the frontend
postmortems were deleted once shipped; their lessons live in `AGENTS.md`, the two package READMEs and
the `verify-auth-in-browser` skill. `git log -p -- <this file>` has the originals.*

## Where the work stands

### Done

| | Evidence |
| --- | --- |
| `packages/auth` — contracts, JWT verifier, static + JWKS key sources, config schema, test kit | 109 tests |
| `packages/tsed-auth` — guard, decorators, injectable `Principal`, OpenAPI security, test helper | 43 tests |
| `packages/ui-auth` — login, renewal, expiry-aware token, shared `<AuthCallback>` | `ed0bb43`; verified in Chromium against the live IdP |
| `qr-manager-api` enforces on `/qr-codes` | `d1c02b8`; 96 tests incl. forged / wrong-audience / expired / non-bearer |
| `miot-bridge-api` enforces on every REST route (Track B) | 56 tests over all 16 routes; verified live — `401`, `503` on an unreachable JWKS, `BEARER_JWT` in both Swagger documents |

### What each API admits

| API | Admits |
| --- | --- |
| `qr-manager-api` | `IDP` on `/qr-codes`. `GET /r/:slug`, `GET /qr-codes/:id/image` and `/health*` stay open |
| `miot-bridge-api` | `IDP` on all 16 REST routes. `/health*` open |
| `interactive-map-feeder-api` | `IDP` on three routes, `DEVICE` on the one the map polls. `/health*` open |

**Guarding HTTP is not the same as securing a device.** `miot-bridge-api`'s `/command` actuates
devices, but commands also arrive on an MQTT subscription that never passes a controller — that
identity is the broker's, and EMQX topic ACLs are `homelab` work. There was a third path, an
unauthenticated UDP command listener; it is **deleted**, along with the UDP notification transport.
`homelab` had already stopped exposing it (owner, 2026-08-27: never used), so the code was a dead
socket no decorator or broker ACL could have covered.

### Next

Two tracks. **They touch disjoint files and can be taken by two agents at once.** Anything outside a
track's listed paths belongs to the other one.

**~~Track B — onboard `miot-bridge-api`~~ — DONE.** All four controllers guarded with one
`AuthMethod.Idp`; no per-route ranking, because separating "read the registry" from "actuate a device"
is authorization and waits for scopes. Three things it turned up, none of them predicted:

1. **`DeviceNotificationsController` is a child controller**, and Ts.ED's `UseAuth` decorates only the
   class it sits on. Without its own decorator those four routes would have shipped open beside twelve
   closed ones. There is now a route-by-route test table rather than one call per controller.
2. **Importing `createAuthConfigSchema` from `@radoslavirha/tsed-auth` registers a DI provider.** The
   barrel also exports `AuthenticationService`, whose `@Injectable()` runs on import — so a config
   schema import made every unit test in the service resolve an `AuthenticationService` with no config,
   failing 90 tests with an injection error nowhere near authentication. Import it from
   `@radoslavirha/auth`, which is framework-free. `qr-manager-api` has the same import and the same
   latent trap.
3. **The refusal logged the credential.** See the redaction note below.

**The IdP side of Track B is now declared** in `homelab` (uncommitted): `miot-bridge` gains the same
four deployed applications `qr-manager` has, and every app gains a `{ stage: local }` environment —
`qr-manager-local`, `miot-bridge-local`, `homelab-dashboard-local`. **Sandbox applications no longer
carry a loopback redirect URI.** Local configs in this repo now point at the `-local` clients.

Still needed before a local login works, and only you can do it: **group membership**. The blueprint
creates `qr-manager-local-admin`, `miot-bridge-local-admin` and `homelab-dashboard-local-viewer`, but
does not put anyone in them.

**~~Track C — onboard `interactive-map-feeder-api`~~ — DONE.** Two trust domains rather than one,
because there are genuinely two callers: `IDP` for people, `DEVICE` for the LaskaKit map. A
method-level `@Authenticate` **replaces** the class-level one rather than adding to it — verified
against `Store.fromMethod` before the design was committed to — so the map's route admits `DEVICE` and
refuses `IDP`, and its three neighbours do the reverse. Nothing there is protecting a secret; every
route reads public ČHMÚ data. What the split protects is a leaked device credential, which lives in
flash on a board that talks cleartext HTTP, reaching exactly one endpoint.

The device token carries `aud`/`iss` of its **own** client, not this API's, and the API trusts that
pair explicitly — option 1 of *Devices* in `homelab`'s tenancy-topology spec, which needs no Authentik
scope mapping and reads no role claim.

**The map has no credential yet, and issuing one is not a solo change.** Over plain HTTP the
`client_secret` crosses the LAN on every refresh, so whoever captures one refresh mints tokens forever
and a short lifetime buys nothing. The runbook — Authentik application, service account, the group
binding that gates `client_credentials`, and the ESPHome TLS + token-fetch change that must land in the
same pass — is in `apis/interactive-map-feeder-api/README.md`. **Until it lands the map is broken**: it
sends no token and the route now answers `401`.

**Still open: the `postman` client.** Contract §7 designed it and deferred it to "the same pass as the
first enforcing API" — that pass has happened. It is a **separate** client from the `-local` ones, and
deliberately so: `-local` mimics one deployed app, whereas Postman wants the opposite shape — one token
spanning every API, `offline_access` bound (a desktop app has no XSS surface), possibly a longer
lifetime. Those are settings no browser client should inherit, which is exactly why it cannot be folded
into `<app>-local`.

It needs the `accesses` multi-audience mapping, which is designed but unbuilt in the chart — without it
a `postman` client's token carries `aud: postman` and reaches nothing. Until then, `<app>-local` is the
way to hold a token by hand, one app at a time.

**After both land:** a changeset and release covering `@radoslavirha/auth`, `@radoslavirha/tsed-auth`,
`@radoslavirha/ui-auth`, `qr-manager-api` and `qr-manager-ui`. Nothing since `qr-manager-ui@0.10.1` is
released.

**Parked, blocking nothing:** P1.7 authorization (`@Scopes()`, roles on `Principal`). It waits for a
route that genuinely needs "admins only"; plumbing only when it comes.

### Onboarding an API — the five pieces

What `d1c02b8` did, in order. Each is small; the thinking is all in the second step.

1. `src/models/config/AuthMethod.enum.ts` — the service's own names, beside `ExternalApi`. Name the
   trust domain (`IDP`), not the caller class and not the mechanism.
2. Rank every route. Guarded is the default; each `@Anonymous()` needs a reason in a comment next to
   it. `qr-manager-api`'s image route is anonymous because `<img src>` cannot send a header — that is
   the shape of an acceptable reason.
3. `ConfigSchema`: `auth: createAuthConfigSchema(Object.values(AuthMethod))`, plus the `auth` block in
   `config/test.json` (inline HS256 key) and `config/localhost.json` (the sandbox IdP's JWKS).
4. `providers/AuthProvider.ts` overriding `AuthenticationService`, and
   `security: [SwaggerSecurityScheme.BEARER_JWT]` in `index.ts`.
5. Integration tests for the paths that only ever fail: forged signature, wrong audience, expired
   token, non-bearer scheme, and a refusal that leaks nothing about why.

**Before calling any auth change done, run the `verify-auth-in-browser` skill.** Six bugs in this area
have passed a green test suite. If it is not in your skill list, `apm install` has not been run since it
was added — the source is `.apm/skills/verify-auth-in-browser/`.

---

## The design, in the parts that still decide things

### Every verifier resolves to one shape

```ts
interface Principal {
    subject: string;                          // stable id
    kind: 'human' | 'service' | 'device';
    displayName?: string;
    roles: string[];
    issuer: string;                           // which trust source vouched
}
```

Business logic, audit fields and OTel attributes consume `Principal` and never learn which mechanism
produced it. Adding a mechanism later is a new verifier returning the same shape — not a change to
anything downstream.

This is also what keeps the design Kubernetes-agnostic. A ServiceAccount token is not a special case in
the code; it is "an issuer whose JWKS fetch happens to need a bearer token", which is transport
configuration. Delete that config row and the same binary runs on a VM.

**One consequence for the application API.** On an `@Anonymous()` route there is no `Principal`. The
injected value is therefore `Principal | undefined`, and **no synthetic "local-dev" principal is
fabricated** — a fake subject in an audit column is worse than an empty one, because it is
indistinguishable from a real subject later.

### Caller classes

Four kinds of caller — the table Tracks B and C have to answer against. Using one mechanism for all of
them is the mistake to avoid.

| Class | Who | Transport | Mechanism |
| --- | --- | --- | --- |
| **Human via browser** | The owner plus a small trusted group. Two frontends today | HTTP | In-app OIDC + PKCE per SPA, bearer to this repo's APIs. Not forward-auth |
| **Service in cluster** | Anticipated in `apis/qr-manager-api/README.md`. None exist yet | HTTP | k8s SA token verified as OIDC, or IdP `client_credentials` |
| **Device** | ESP32 / LaskaKit, Loxone miniserver | **MQTT first**, HTTP second | EMQX per-client credentials + topic ACLs (`homelab` work) |
| **Anonymous** | `GET /r/:slug`, `/health*` | HTTP | Stays open, by explicit route-level allowlist |

**MQTT is not a footnote.** Most device traffic is MQTT, so most device authentication is a broker
concern, not an application concern — and the broker already has per-client identity. The
application-layer work is smaller than it first appears; the broker-layer work is larger, and it lives
in `homelab`.

**Identity does not propagate by forwarding a token.** When A calls B on a human's behalf, B sees A's
*service* identity and no user (`sub: system:serviceaccount:…`, kind `service`). Token pass-through is
rejected: the token's `aud` was minted for A, B would inherit the user's full powers, and compromising A
would yield every caller's token. The correct upgrade — RFC 8693 token exchange with an `act` claim — is
available (`TokenExchangeStrategy` in `packages/http-provider` already implements the client half) and
deliberately unbuilt: there is no user-initiated cross-service call yet.

### The verifier's configuration is the whole idea

```yaml
trustedIssuers:
  - name: cluster-server2                      # Kubernetes is just a row
    issuer: https://192.168.1.201:6443
    jwksUri: https://kubernetes.default.svc/openid/v1/jwks
    jwksAuth: serviceAccountToken              # transport detail, not a code path
    audience: qr-manager-api
    subjectKind: service
  - name: idp
    issuer: https://auth.irha.cz/application/o/<client_id>/
    jwksUri: https://auth.irha.cz/application/o/<client_id>/jwks/
    audience: <client_id>
    subjectKind: human
```

Same `jose.jwtVerify` call, same `Principal` out. Add a cluster, swap IdPs, or run with no Kubernetes at
all — each is a config change.

### Settled, not open

- **There are no modes.** No `disabled`, no `permissive`, no `enabled: false`, no `dummy` verifier type.
  Every such state is one where a forgotten key in a values file leaves a service up, healthy and
  unauthenticated — which is exactly the hazard modes were introduced to prevent, since `disabled` was
  their default.
- **A name is not a mechanism.** `AuthMethod.Idp` says which callers a route admits; the entry's `type`
  (`VerifierType.BearerJwt`) says how they are checked. Naming entries after their mechanism caps the
  design at one entry per mechanism, so a cluster's ServiceAccount token would be accepted everywhere a
  person's token is.
- **The names belong to the service.** `AuthMethod` is declared per API beside `ExternalApi`;
  `packages/auth` takes plain strings. Which callers a deployment admits is not something a package that
  may be published can name.
- **Misconfiguration fails at boot.** `createAuthConfigSchema` is strict: a missing entry, a verifier
  trusting no issuers, or a mistyped key are parse errors naming the path.
- **Local development gets a client per app** — `<app>-local`, declared `{ stage: local }`. The earlier
  argument here was that a dedicated client is not worth a second trusted-issuer row in every API. That
  argument was wrong on its own terms: `accesses` widens `aud` but never `iss`, and `issuer_mode` is
  `per_provider`, so **any** client other than the app's own already needs that row — a Postman client
  included. The row costs the same either way, and a `-local` client buys what the loopback-on-sandbox
  arrangement could not: it is separately revocable, its token is useless against a deployed API unless
  someone deliberately trusts it, and no deployed client carries a loopback URI. The chart `fail`s if a
  local environment names a cluster.
- **Postman is the one client that should be broad**, and it cannot be an SPA's client: it wants
  `accesses` spanning every API, `offline_access` bound (a desktop app has no XSS surface), and
  possibly a longer token lifetime — three settings no browser client should inherit. Per-Application
  in the blueprint, revocable by its own group. See contract §7.
- **Local development is an issuer row, never a bypass.** `config/localhost.json` verifies real tokens
  against the sandbox IdP's JWKS; `config/test.json` uses an inline HS256 key and needs no network. The
  code exercised locally is the code that runs in production, and 401/403 are testable. The honest
  caveat: copy `localhost.json`'s auth block into `production.json` and the dev secret becomes a trusted
  production issuer — the boot-time issuer log is the mitigation that costs nothing.

## Later, and deliberately not now

- **Machine identity.** Audience-bound projected SA tokens (`audience: <callee>`,
  `expirationSeconds: 900`; the kubelet rewrites the file at ~80% of its lifetime, which is why
  `KubernetesServiceAccountStrategy` needs expiry-aware caching), plus the `http-provider` fixes — add
  `audience` to the k8s SA strategy, and fix its missing cache (it re-reads the token file on every
  request and its `invalidate()` is a no-op). Authentik's `client_credentials` is the alternative and
  mints **the same RS256 JWT** a human login produces, verified by the same code.
- **API-key verification.** Deferred, not dropped: no HTTP-device caller exists, and the protocol (key
  alone, or key plus HMAC signing) is unspecified. Adding `ApiKeyVerifier` later is a new file
  implementing an existing interface.
- **MQTT authorization.** Topic ACLs are `homelab` work; whether MQTT moves to JWT auth is a decision
  for after they land.
- **DPoP, mTLS, HMAC signing.** Roots first.

## Open decisions

1. **Device path for actuating HTTP routes** — API key alone, or key plus HMAC signing. Deferred until
   an actuating HTTP device exists. **Track B may force this**, if the miot poller is judged an HTTP
   device rather than a service.
2. **k8s SA vs IdP `client_credentials` for service-to-service** — start with SA tokens: no IdP
   dependency and no stored secrets. Both are issuer rows, so switching later is configuration.
3. **How deep authorization goes** — plumbing only, or a config-driven subject → roles map.
   Recommendation: plumbing only. A roles table has no human subjects to hold yet.

## Facts worth not re-deriving

| Fact | Evidence |
| --- | --- |
| IdP is Authentik 2026.8.1 on server3 — five applications, nine role groups | `homelab`, 2026-09-04 |
| `radoslav` is a non-superuser in `qr-manager-server1-sandbox-admin` only | The login for the happy path, and the refused user for the other four apps |
| `localhost:5173` is a registered redirect URI on **sandbox applications only** | So `pnpm dev` completes a real login; never add one to a production application |
| Cluster SA tokens are OIDC JWTs, issuer **per cluster** | `kubectl get --raw /.well-known/openid-configuration` → issuer is the apiserver URL; server1/2/3 differ |
| Cluster JWKS is **not** anonymous | anonymous `curl` → `401`; `ClusterRoleBinding system:service-account-issuer-discovery` lets any pod with a token fetch it |
| Pods project a SA token and `ca.crt` | `iot-applications` chart, opt-in volume (`c43b555`), enabled by all three APIs; verified on a running pod |
| API pods can reach the IdP | `homelab` `0b903db`; JWKS fetch verified from a pod in all four namespaces |
| A local HS256 round trip needs no new outbound code | `JwtSelfSignedStrategy.importKey` + `JwtKeySchema` accept an inline key |
| Every dangerous route sits under a named prefix | `qr-manager-api`: `/r/:slug` public, all CRUD under `/qr-codes`. `miot-bridge-api`: `/command`, `/devices`, `/model-property-overrides`, nothing at root |
| `/health` shadowed by a slug route returns **400, not 404** | `@Pattern(SLUG_PATTERN)` rejects in the params pipeline. Probes stay green while the human endpoint breaks |
| `GET /qr-codes/:id/image` cannot carry a header | Loaded by `<img src>` and `<a download>`; it is `@Anonymous()` for that reason |
