# Auth design and work packages

**Status 2026-09-07: P1.0–P1.6 built, and `qr-manager-api` enforces.** An unauthenticated `GET
/qr-codes` now answers `401`. Every *other* HTTP API in this repo still answers in full — including
`miot-bridge-api`'s `/command`, which actuates physical devices. See
[Where the work stands](#where-the-work-stands) for what is done, what is next, and which pieces can
run in parallel.

**Read [`2026-09-04-authentik-integration-contract.md`](./2026-09-04-authentik-integration-contract.md)
first.** It is the authority for every concrete IdP fact — endpoints, `client_id`s, claims, traps.
This document is the other half: what we build here, in what order, and why the shape is what it is.

## Where the work stands

Updated 2026-09-07. **Read this before starting anything**; the sections below are design rationale,
not status.

### Done

| | Evidence |
| --- | --- |
| `packages/auth` — contracts, JWT verifier, static + JWKS key sources, config schema, test kit | 109 tests |
| `packages/tsed-auth` — guard, decorators, injectable `Principal`, OpenAPI security, test helper | 43 tests |
| `qr-manager-api` enforces on `/qr-codes` | `d1c02b8`; 96 tests incl. forged / wrong-audience / expired / non-bearer |
| Local verification against the live IdP | Browser login → real RS256 token → verified against live JWKS |

The design settled on three things that the older sections below still argue about. **These are
decided, not open:** there are no auth modes (`AuthMode` is deleted); the `auth` block is a map of
service-named entries whose `type` picks the verifier; and `AuthMethod` is declared per API, not by the
package. See [the superseded modes section](#three-modes-not-an-onoff-switch--no-modes-at-all).

### Which APIs are still open

| API | State | Risk if left |
| --- | --- | --- |
| `qr-manager-api` | **Enforcing** | — |
| `miot-bridge-api` | Open | `/command` actuates physical devices. Highest-risk endpoint in the repo |
| `interactive-map-feeder-api` | Open | Read-only radar data; lowest risk |

### Next, and what can run in parallel

Three tracks. **They touch disjoint files and can be taken by three agents at once.** Anything
outside its own listed paths is somebody else's track.

**Track A — frontend session handling.** `packages/ui-auth`, `ui/qr-manager-ui`.
The most urgent, because `d1c02b8` made it a live bug rather than a latent one: an admin session now
breaks about thirty minutes in, and reports itself healthy while doing so. Three defects, all found by
reading the shipped code in P1.F2:

1. **No token renewal exists at all.** Renewal must be a top-level `prompt=none` redirect — never an
   iframe, because Authentik sends `X-Frame-Options: DENY` on every response.
2. **`getAccessToken()` ignores `user.expired`**, so the request seam attaches a dead token.
3. **A `401` classifies as `client-error`**, which `statusForOutcome` maps to `ok` — right for a
   validation error, wrong for an expired session. It needs its own outcome so the banner stops
   claiming health.

Use the **`verify-auth-in-browser`** skill before calling any of this done. Six bugs in this area have
passed a green test suite.

**Track B — onboard `miot-bridge-api`.** `apis/miot-bridge-api/**` only.
Follow `d1c02b8` as the worked example; it is the same five pieces. Rank every route explicitly rather
than blanket-guarding, because `/command` actuating a device is a different question from reading a
registry. Decide what the poller and any MQTT path present as — they are not browser callers, and a
ServiceAccount or a second trust-domain entry may be the answer rather than a human's token.

**Track C — onboard `interactive-map-feeder-api`.** `apis/interactive-map-feeder-api/**` only.
The smallest of the three. Its consumer is a LaskaKit device on the LAN, not a browser, so the caller
question is the whole of the work — a device holding a PAT from the IdP is one entry; a wholly public
read-only API is a defensible answer too, but it must be written down rather than left by omission.

**Not parallel, and not yet:** P1.7 authorization (`@Scopes()`, roles on `Principal`) still blocks
nothing and should wait for a route that genuinely needs "admins only". The changeset and release for
the two new packages come after all three tracks land.

### Onboarding an API — the five pieces

What `d1c02b8` actually did, in order. Each is small; the thinking is all in the second step.

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


## Why this work exists

**Every HTTP API in this repo is unauthenticated on the LAN.** Verified 2026-08-29: an unauthenticated
`curl` to `https://api.server1.homelab.irha.cz/iot/qr-manager/qr-codes` returns the full record list.
`miot-bridge-api`'s `/command` actuates physical devices on the same terms. The dashboard's UniFi proxy
is reachable by anyone who can resolve `dashboard.server3.homelab.irha.cz`.

**That does not close when login works.** P1.F ended with the frontends sending a bearer token and the
APIs still ignoring it. It began closing on 2026-09-07, when `qr-manager-api` first rejected a
request. It is not closed while any API in the table below is still open.

## What is already done, so it is not re-derived

| | State |
| --- | --- |
| IdP | Authentik 2026.8.1 on server3, five applications, nine role groups — `homelab`, 2026-09-04 |
| Its contract | Verified end to end against the live instance; see the contract doc |
| A human account | `radoslav`, non-superuser, in `qr-manager-server1-sandbox-admin` only — the login for the happy path and the refused user for the other four apps |
| API pods reaching the IdP | Fixed — `homelab` `0b903db`, JWKS fetch verified from a pod in all four namespaces |
| TLS on every exposed hop | Done 2026-09-03 |

**P1.F is finished.** Its two execution plans were written 2026-09-05, executed, and deleted. The next
unit is **P1.0**.

---

## The principle everything rests on

Every verifier — IdP JWT, apiserver JWT, API key, MQTT client identity — resolves to the **same
shape**:

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

This is also what keeps the design Kubernetes-agnostic. A ServiceAccount token is not a special case
in the code; it is "an issuer whose JWKS fetch happens to need a bearer token", which is transport
configuration. Delete that config row and the same binary runs on a VM.

**One consequence for the application API.** On an `@Anonymous()` route there is no `Principal`. The
injected value is therefore `Principal | undefined`, and **no synthetic "local-dev" principal is
fabricated** — a fake subject in an audit column is worse than an empty one, because it is
indistinguishable from a real subject later.

## Caller classes

Four kinds of caller. Using one mechanism for all of them is the mistake to avoid.

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

**Anonymous routes are an allowlist, not an exception.** Auth is opt-in per route, because the next
catch-all route is one decorator away.

**Identity does not propagate by forwarding a token.** When A calls B on a human's behalf, B sees A's
*service* identity and no user (`sub: system:serviceaccount:…`, kind `service`). Token pass-through is
rejected: the token's `aud` was minted for A, B would inherit the user's full powers, and compromising
A would yield every caller's token. The correct upgrade — RFC 8693 token exchange with an `act` claim —
is available (`TokenExchangeStrategy` in `packages/http-provider` already implements the client half)
and deliberately unbuilt: there is no user-initiated cross-service call yet.

## What gets built

- **`packages/auth`** — framework-free, `private: true`, exportable from day one. `ITokenVerifier`,
  multi-issuer JWKS verification over `jose.createRemoteJWKSet`, audience validation, subject →
  `Principal` mapping, Zod schemas in the style of `packages/http-provider/src/schemas/auth.schema.ts`.
  **Zero Kubernetes imports.** Also static-key issuer rows, the boot-time issuer log, and the outcome
  counter. (The token-minting script that was listed here
  is dropped — see P1.4.)
  Graduation checklist: [`2026-08-11-health-packages-graduation.md`](./2026-08-11-health-packages-graduation.md).
- **`packages/tsed-auth`** — `@Authenticated()` / `@Scopes()`, injectable `Principal`, redaction
  integration so tokens never reach a log, OTel attributes, and wiring of the already-present-but-unused
  `SwaggerSecurityScheme.BEARER_JWT`. Ergonomic target: hikers-book's
  `src/auth/decorators/JWTAuth.ts`, which composes `Authenticate` + `Security(BEARER_JWT)` +
  `Returns(401)` into one decorator — and records the Swagger trap: do **not** set `.Required(true)` on
  the header, or Swagger demands it typed manually instead of offering the Authorize button.
- **A frontend auth package** — OIDC + PKCE as a public client, per-target bearer attachment, React
  bindings. Its own `private` workspace package on the incubation path: not `ui-kit` (components), not
  `ui-runtime` (carries neither the dependency nor the concern — it reads `ui-runtime`'s config, it
  does not live inside it).
- **`packages/http-provider` fixes** — add `audience` to the k8s SA strategy; **fix its missing cache**
  (it re-reads the token file on every request and its `invalidate()` is a no-op, violating the caching
  contract `IAuthStrategy` itself documents).

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

Same `jose.jwtVerify` call, same `Principal` out. Add a cluster, swap IdPs, or run with no Kubernetes
at all — each is a config change.

## ~~Three modes, not an on/off switch~~ — no modes at all

**Superseded 2026-09-07. `AuthMode` is deleted; there is no `disabled`, no `permissive`, no
`enforced`.** The section is kept because the reasoning against `enabled: false` still stands — it
turned out to apply to the modes themselves.

The case for three modes was that `permissive` answers "how many callers would this break" from real
traffic, removing the big-bang cutover. That is worth a great deal where the callers are unknown. Here
there are two UIs and one operator, every API is onboarded in a single release, and the deployment
target tolerates downtime — so the observation window buys nothing that reading the config does not.

`disabled` was justified by local development, and P1.F2 disproved it: `pnpm dev` completes a real
login against the live IdP from the registered `localhost:5173` redirect URI, and the local API
verifies those tokens against the live JWKS. There is nothing to disable. Where an IdP genuinely is
not reachable, an inline HS256 issuer row verifies for real — which is what `config/test.json` does.

**Deleting the mode is strictly safer, which is the part worth noticing.** The argument against
`enabled: false` was that it fails open: a values file that forgets the block leaves a service up,
healthy and unauthenticated. `mode` had exactly that hazard — `disabled` was the *default*, so a
forgotten block failed open in precisely the way the three modes were introduced to prevent. With no
mode there is no fail-open state left to reach.

What replaces it is a schema that cannot express "not really on":

- the `auth` block **is** a map of named entries, not an array and not a wrapper around one, and a
  service declares the names its routes use — `createAuthConfigSchema(Object.values(AuthMethod))`. A
  config missing one fails to parse at boot naming `auth.IDP`. The array form could only count
  elements after the fact. That schema is strict, so a `IPD` typo is rejected rather than stripped.
- a name is **not** a mechanism. `AuthMethod.Idp` says which callers a route admits; the entry's
  `type` (`VerifierType.BearerJwt`) says how they are checked. Naming entries after their mechanism
  capped the design at one entry per mechanism, so a cluster's ServiceAccount token would have been
  accepted on every route a person's token was — see the caller-classes table above.
- **the names belong to the service.** `AuthMethod` is declared per API, beside `ExternalApi`, and
  `packages/auth` takes plain strings. Which callers a deployment admits is not something a package
  that may be published can name.
- there is no `dummy` or `allow-all` verifier type, for the same reason there is no mode.
- nothing else lives at that level. An `anonymousRoutes` list was tried and deleted — nothing enforced
  it, so it was a second copy of what `@Anonymous()` already says, free to drift from it.
- a `jwt` verifier must carry at least one trusted issuer, so "configured but verifies nothing" is
  rejected by Zod rather than by a hand-written assertion.
- `@Authenticate(AuthMethod.Idp)` takes the method as a **required** argument, so what a route asks
  for and what the config must supply are the same enum.

What survives from the observability half: the boot log naming every trusted issuer with its key
source (the answer to "why is my token rejected" nine times in ten), and the `auth.verifications`
counter labelled by outcome. The `auth.mode` gauge is deleted with the modes.

### Local development is an issuer row, never a bypass

`config/localhost.json` verifies for real. As shipped it points at the sandbox IdP's JWKS; where no
IdP is reachable, a static-key row does the same job with no network — which is what
`config/test.json` uses:

```jsonc
"auth": {
    "IDP": {
        "type": "bearer-jwt",
        "trustedIssuers": [
            {
                "name": "dev-local",
                "issuer": "dev",
                "key": { "source": "value", "algorithm": "HS256", "value": "local-dev-secret" },
                "audience": "qr-manager-api",
                "subjectKind": "service"
            }
        ]
    }
}
```

A static-key row means `jose.jwtVerify` takes the key directly and no JWKS endpoint has to exist.

**The outbound half already exists.** `JwtSelfSignedStrategy.importKey` handles `HS256` via
`node:crypto` `createSecretKey`, and `JwtKeySchema` accepts `{ source: 'value', value }` — so a
caller's `localhost.json` points its `externalApis` entry at `strategy: jwt-self-signed` with the same
secret and the two halves meet in a real signed round trip on localhost. That turns local development
into the standing integration test for the whole scheme.

Why this beats a bypass flag, one line each:

- the code exercised locally is the code that runs in production;
- 401 and 403 become testable locally and in `config/test.json`, instead of being the only paths never
  covered;
- **it fails closed** — a leftover dev issuer row is exploitable only by someone who also has the dev
  secret, where a leftover `enabled: false` *is* the whole vulnerability.

The honest caveat: copy `localhost.json`'s auth block into `production.json` and the dev secret becomes
a trusted production issuer. The boot-time issuer log is the mitigation that costs nothing.

---

# Work packages

Two independent tracks. **P1.F is implemented first** and shares no file with any P1.x unit.

```
       P1.F1 login  →  P1.F2 token on our calls    (first — own timeline)
                                    ·
                        P1.0  contracts + test kit          (gate — one agent, alone)
                                    │
        ┌───────────┬───────────┬───┴───────┬───────────┬───────────┐
      P1.1        P1.2        P1.3        P1.4        P1.5        P1.6      [P1.7 parked]
    jwt core    remote      mode +      dev mint    tsed-auth   openapi
   + static     jwks        observ.       cli         guard     security
      keys                                                       metadata
        └───────────┴───────────┴───────────┴───────────┴───────────┘
                                    │
                              Phase 1b — onboarding
```

## P1.F — frontend auth, and the first UI

Each SPA performs authorization-code + PKCE against Authentik as a **public client, no secret**, holds
the token **in memory**, and attaches it to calls to *this repo's* APIs only. Frontends also call third
parties — `homelab-dashboard-ui` reaches UniFi through an nginx `proxy_pass` with no credential of its
own — so this is **a per-target client, never a global `fetch` interceptor**. A call with no client
stays bare.

**Access is gated at the IdP, not in the app.** A user who is not in the application's group never
reaches the callback. So P1.F1 needs no "you are not allowed here" screen behind the callback; it needs
to handle a login that ends at the IdP instead of coming back.

Config lives in the runtime `config.json` — `issuer`, `clientId`, `scope`, `redirectUri` and
`postLogoutRedirectUri` are all non-secret, and the `auth` block is **required** (contract §6). Exact
keys, values and the reason `redirectUri` is spelled out rather than derived: the contract.

Three Authentik behaviours shape the implementation, all verified, all in the contract:

- **No refresh token is issued.** Recovery is a top-level `prompt=none` redirect against the IdP session
  cookie. There is no fallback, and as of P1.F2 there is no renewal at all — see P1.F2's finding 1.
  The access token lives **30 minutes**, not 300 seconds; that changed when renewal became a navigation.
- **`prompt=none` has three outcomes**, not two. A valid session whose user is not in the group returns
  a `200` HTML page and never redirects — time it out, and treat the timeout as *not authorized*.
- **Logout ends the IdP session**, because the provider binds `default-invalidation-flow`. That is a
  `homelab` decision, not a frontend one. There is one *Log out* button and no *Sign out everywhere*.

### ~~P1.F1 — login~~ — DONE, shipped as `qr-manager-ui@0.10.1`, 2026-09-05

A user logs in, the UI shows who they are, a reload keeps the session. No API call changed.

Verified in Chromium against the live IdP, on all four deployed applications and on `pnpm dev`.
Cross-environment SSO and global logout confirmed; token claims confirmed per application.

**Four things the plan got wrong, all found by running it, none by tests:**

1. **Silent renewal cannot use an iframe.** Authentik sets `X-Frame-Options: DENY` on every response.
   Recovery and renewal are top-level `prompt=none` redirects, which is also what makes SSO work.
2. **The app was usable while signed out.** "Access is decided at the IdP" was wrong: the IdP gates
   *tokens*, not *pages*, and nothing forced a login. The whole app is now gated behind sign-in —
   **UX, not security**, since no API verifies anything until Phase 1b.
3. **The gating fix hung on `Loading…`**, because a no-session callback produces no user-loaded event
   and the provider never settled.
4. **The authorization code was exchanged twice per login** — codes are single-use, StrictMode
   double-invokes effects, and the second attempt returned 400. Invisible without a browser.

Two knock-on decisions, both recorded in the contract: the token lifetime went 5 min → **30 min**
(renewal is now a navigation, so 5 minutes was unusable; revocation latency grows to match), and
logout became a **single button that ends the IdP session** by binding `default-invalidation-flow`.

`localhost:5173` is now a registered redirect URI on **sandbox applications only**, so `pnpm dev` can
complete a real login. That it was not is why all four mistakes reached a deployed environment first.
Anything touching auth from here uses the **`verify-auth-in-browser`** skill.

### ~~P1.F2 — token on our calls~~ — DONE 2026-09-06, not released

All six calls in `src/api/qrCodes.ts` route through one `request()` seam that attaches the token from an
injected getter. Verified in Chromium against the live IdP, on `pnpm dev` against a local
`qr-manager-api`: `GET`, `POST`, `PUT`×3 and `DELETE` all carry the header, no other request carries one,
and signed out the app issues no API call at all.

**This delivers no security, and the docs must not read as though it does.** An unauthenticated `curl`
still returns everything. What it delivers is a verified end-to-end human token.

**Three things it left for Phase 1b, all found by reading the shipped code:**

1. **Nothing renews the token.** `automaticSilentRenew` is off — correctly, it uses an iframe — but
   nothing replaced it. `AuthContext` subscribes only to `addUserLoaded`/`addUserUnloaded`, `recover()`
   runs once on mount, and there is no timer in the package. A tab open past the 30-minute lifetime
   holds a dead token.
2. **`getAccessToken()` does not check `user.expired`**, so the seam attaches that dead token. Harmless
   while the API ignores it.
3. **A 401 will report the backend as healthy.** `classifyResponse` maps every 4xx to `client-error`,
   which `statusForOutcome` maps to `ok`. Right for a validation error, wrong for an expired session:
   the user gets a green banner and a raw `Request failed with 401` string, and nothing prompts a
   re-login. 401/403 are the only 4xx that mean "your session, not your input".

**Not every call can carry a header.** `GET /qr-codes/:id/image` is loaded by `<img src>` and offered as
`<a download>` links, which cannot send one. Phase 1b must rank that route explicitly — leave it public,
mint a signed URL, or fetch it to a blob.

## P1.0 — contracts and test kit (gate)

**Runs alone, first. Everything else compiles against it.**

Package scaffolding for `packages/auth` — `package.json` (`private: true`), `tsconfig.json`,
`vitest.config.ts`, `eslint.config.mjs`, `tsdown.config.ts` — following `packages/http-provider` and
the graduation checklist. Then types and schemas, no logic:

- `src/Principal.ts` — the shape above.
- ~~`src/AuthMode.ts`~~ — **deleted 2026-09-07**, see the superseded modes section above.
- `src/ITokenVerifier.ts` — credential material in, outcome out. **No JWT in the signature**, **async**,
  and the outcome type has room for "could not determine" — a JWKS fetch is I/O that can fail, and a
  transport failure is not a verification failure. This is what keeps `ApiKeyVerifier` and introspection
  addable later without touching every implementation.
- `src/IKeySource.ts` — the seam between P1.1 and P1.2.
- `src/VerificationOutcome.ts` — `ok | missing | invalid | wrong-audience | unknown-issuer`. These
  strings are simultaneously P1.3's metric labels, the log vocabulary and the HTTP status mapping.
  Three units inventing three spellings is the likely failure.
- `src/schemas/auth.schema.ts` — Zod. Trusted-source rows as a discriminated union (one member today).
  Every field optional and defaulted, per the `AGENTS.md` configuration contract. *(Reshaped since: the
  block is a map of named entries and the required keys come from the service's own enum — see
  [Where the work stands](#where-the-work-stands).)*
- `src/index.ts` — **written complete, with every planned export, including ones whose files do not
  exist yet.** A barrel only re-exports, so six agents appending to it in parallel is six conflicts on
  one file.

Test kit, shared so three units do not each invent one: `src/test/mintTestToken.ts` (HS256 fixture
signing) and `src/test/FakeTokenVerifier.ts` (lets P1.5 test the guard with no real verifier).

Dependencies declared upfront: `jose`, `zod`, `@opentelemetry/api`. `jose` is already in the tree via
`packages/http-provider`, so nothing new reaches the lockfile.

**Done when:** the package builds, `index.ts` exports resolve as types, no implementation exists.

## P1.1–P1.7

| Unit | Owns | Notes |
| --- | --- | --- |
| **P1.1** jwt core + static keys | `src/verifiers/JwtVerifier.ts`, `src/keys/StaticKeySource.ts` | Needs no infrastructure — HS256 with an inline key makes a full signed round trip locally |
| **P1.2** remote JWKS | `src/keys/RemoteJwksSource.ts` | The IdP's JWKS is anonymously readable, so build the plain case first and the ServiceAccount-authenticated fetch second. Cache by `kid`, bounded refresh, **explicit timeout** — a blocked JWKS fetch is a hang, not a refusal |
| **P1.3** ~~mode pipeline~~ + observability | boot log, outcome counter | Uses P1.0's outcome strings verbatim. The mode gate and `auth.mode` gauge were **removed 2026-09-07** — see the superseded section above |
| ~~**P1.4** dev-token minting CLI~~ | — | **Dropped 2026-09-06.** Its purpose was Swagger's Authorize button; that workflow is not wanted, and `pnpm dev` already completes a real login against the live IdP from the registered `localhost:5173` redirect URI — a real RS256 token beats a minted HS256 one. Integration tests mint in-process with P1.0's `mintTestToken`, which needs no CLI |
| **P1.5** `packages/tsed-auth` guard | guard, decorators, injectable `Principal` | Substance. Tests against `FakeTokenVerifier` |
| **P1.6** OpenAPI security metadata | swaps `security: []` for the real scheme | Small |
| **P1.7** authorization plumbing | `@Scopes()`, roles on `Principal` | **Parked** — a leaf that blocks nothing. Recommendation: plumbing only |

**Sizing, honestly:** P1.0, P1.4 and P1.6 are small. P1.1, P1.3 and P1.5 are the substance. P1.2 is
medium. Six agents is the ceiling, not the target.

**Conflict hotspots, all handled by the gate:** `index.ts` and `package.json` are written complete by
P1.0 and touched by nobody else; fixtures come from P1.0; `VerificationOutcome` strings are defined
once. Beyond that, file ownership is disjoint.

## Phase 1b — onboarding

Where the security actually arrives. Per-route threat ranking and real 401 tests are a different kind
of work from package construction.

**Started 2026-09-07** with `qr-manager-api` (`d1c02b8`). It went first because it was the app whose
frontend already held a token, which made the whole path verifiable in a browser on the first attempt.
`miot-bridge-api` is the higher-risk one and is next.

**The live status, remaining APIs and parallel tracks are in
[Where the work stands](#where-the-work-stands).** The five steps to onboard an API are there too.
The list that used to sit here has been folded into it, so there is one place to read rather than two
that drift.

## Later, and deliberately not now

- **Machine identity.** Audience-bound projected SA tokens (`audience: <callee>`,
  `expirationSeconds: 900`; the kubelet rewrites the file at ~80% of its lifetime, which is why
  `KubernetesServiceAccountStrategy` needs expiry-aware caching), plus the `http-provider` fixes.
  Authentik's `client_credentials` is the alternative and mints **the same RS256 JWT** a human login
  produces, verified by the same code — so `JwtVerifier` covers every caller class this repo has.
- **API-key verification.** Deferred, not dropped: no HTTP-device caller exists, and the protocol
  (key alone, or key plus HMAC signing) is unspecified. Adding `ApiKeyVerifier` later is a new file
  implementing an existing interface.
- **MQTT authorization.** Topic ACLs are `homelab` work; whether MQTT moves to JWT auth is a decision
  for after they land.
- **DPoP, mTLS, HMAC signing.** Roots first.

## Open decisions

1. **Device path for actuating HTTP routes** — API key alone, or key plus HMAC signing. Deferred until
   an actuating HTTP device exists.
2. **k8s SA vs IdP `client_credentials` for service-to-service** — start with SA tokens: no IdP
   dependency and no stored secrets. Both are issuer rows, so switching later is configuration.
3. ~~**Whether `disabled` survives Phase 1**~~ — **Answered 2026-09-07: no.** All three modes are
   deleted, not just `disabled`. See the superseded modes section.
4. **How deep authorization goes in Phase 1** — plumbing only, or a config-driven subject → roles map.
   Recommendation: plumbing only. A roles table has no human subjects to hold until the IdP work lands.
5. **Which app is onboarded first in Phase 1b** — see above.

## Facts worth not re-deriving

| Fact | Evidence |
| --- | --- |
| Cluster SA tokens are OIDC JWTs, issuer **per cluster** | `kubectl get --raw /.well-known/openid-configuration` → issuer is the apiserver URL; server1/2/3 differ |
| Cluster JWKS is **not** anonymous | anonymous `curl` → `401`; `ClusterRoleBinding system:service-account-issuer-discovery` lets any pod with a token fetch it |
| Pods project a SA token and `ca.crt` | `iot-applications` chart, opt-in volume (`c43b555`), enabled by all three APIs; verified on a running pod |
| `jose` is already a dependency | `packages/http-provider/package.json` |
| A local HS256 round trip needs no new outbound code | `JwtSelfSignedStrategy.importKey` + `JwtKeySchema` accept an inline key |
| Swagger security schemes exist, unused | `SwaggerSecurityScheme.BASIC` / `.BEARER_JWT` in toolkit-hub; every API passes `security: []` |
| Every dangerous route sits under a named prefix | `qr-manager-api`: `/r/:slug` public, all CRUD under `/qr-codes`. `miot-bridge-api`: `/command`, `/devices`, `/model-property-overrides`, nothing at root |
| `/health` shadowed by a slug route returns **400, not 404** | `@Pattern(SLUG_PATTERN)` rejects in the params pipeline. Probes stay green while the human endpoint breaks |
