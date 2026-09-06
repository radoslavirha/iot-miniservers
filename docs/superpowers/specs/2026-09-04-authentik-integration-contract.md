# Authentik integration contract

**Status: verified against the live IdP on 2026-09-04.** Every fact below was observed, not read in
documentation. Where something is inferred rather than observed it says so.

**Read this first, before any auth code in this repo.** What we build against it — packages, work
packages, modes, open decisions — is [`2026-09-05-auth-design.md`](./2026-09-05-auth-design.md).

**The IdP is Authentik 2026.8.1**, deployed on server3 by `homelab` (`gitops/argocd-manifests/server3/apps/identity/`).
Applications, providers and groups are generated from one values file,
`homelab` → `gitops/helm-values/server3/authentik-blueprints.yaml` — that is where an app is added,
and it is 20 lines of YAML. The object model and the reasoning behind it are in
[`homelab` → `docs/superpowers/specs/2026-09-04-authentik-tenancy-topology.md`](../../../../homelab/docs/superpowers/specs/2026-09-04-authentik-tenancy-topology.md).

---

## 1. Endpoints

`issuer_mode` is **`per_provider`**, so **each application has its own issuer**. Endpoints are shared;
issuer, JWKS and end-session are per-application.

| | |
| --- | --- |
| **issuer** | `https://auth.irha.cz/application/o/<client_id>/` — **with the trailing slash**, compare it exactly |
| discovery | `https://auth.irha.cz/application/o/<client_id>/.well-known/openid-configuration` |
| authorization | `https://auth.irha.cz/application/o/authorize/` |
| token | `https://auth.irha.cz/application/o/token/` |
| userinfo | `https://auth.irha.cz/application/o/userinfo/` |
| **JWKS** | `https://auth.irha.cz/application/o/<client_id>/jwks/` |
| end session | `https://auth.irha.cz/application/o/<client_id>/end-session/` |
| introspection | `https://auth.irha.cz/application/o/introspect/` |
| revocation | `https://auth.irha.cz/application/o/revoke/` |

`RS256` is the only signing algorithm offered.

**Take the issuer from per-deployment config, never a constant.** It differs per application, the way
`apiBaseURL` already does. Better still, build the client from the **discovery URL** and let it derive
the issuer — see [§5 rule 3](#5-rules-for-a-backend-verifying-these-tokens) for why that is worth more
than it looks.

## 2. The client registry

Five applications exist. All are **public clients with no secret**, all require **PKCE S256**.

| `client_id` | redirect URI (authorization) | post-logout redirect | groups |
| --- | --- | --- | --- |
| `qr-manager-server1-sandbox` | `https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback` | `…/qr-manager/` | `-admin`, `-reader` |
| `qr-manager-server1-production` | `https://apps.server1.homelab.irha.cz/qr-manager/callback` | `…/qr-manager/` | `-admin`, `-reader` |
| `qr-manager-server2-sandbox` | `https://apps.sandbox.server2.homelab.irha.cz/qr-manager/callback` | `…/qr-manager/` | `-admin`, `-reader` |
| `qr-manager-server2-production` | `https://apps.server2.homelab.irha.cz/qr-manager/callback` | `…/qr-manager/` | `-admin`, `-reader` |
| `homelab-dashboard-server3-production` | `https://dashboard.server3.homelab.irha.cz/callback` | `/` | `-viewer` |

Group names are the `client_id` plus the role suffix, e.g. `qr-manager-server1-sandbox-admin`.

Redirect matching is **strict** — no wildcards, no prefix matching. The four `qr-manager` redirect
hosts are exactly what the deployed SPAs already serve at
(`https://apps[.sandbox].<cluster>.homelab.irha.cz/qr-manager/`, verified live), so `/callback` is a
route the SPA must add and nothing else has to move.

| Timing | Value |
| --- | --- |
| authorization code | 60s |
| **access token** | **1800s (30 minutes)** — raised from 300s on 2026-09-05, see below |
| refresh token | 30 days — **but none is issued today**, see [trap 2](#trap-2--there-is-no-refresh-token) |

## 3. What a login actually does — the gate works

The gate the whole IdP choice was made for is real, and it is enforced **at the authorization
endpoint, before any code is issued**. Verified with three throwaway users against
`qr-manager-server1-sandbox`:

| User | Result |
| --- | --- |
| in `qr-manager-server1-sandbox-admin` | code issued, token exchange 200 |
| in **no group** | **`Permission denied` page. No code, no token, no redirect back to the app** |
| in `qr-manager-server2-production-admin` (another app's group) | **`Permission denied`. Same** |

So the frontend does not have to decode a token and decide whether the user is allowed in. A user
without access never reaches the callback. Roles inside the app are a second, finer question that the
`roles` claim answers.

**This holds when hopping between apps, too.** Verified 2026-09-04 with a session already established:
`/authorize` for a *different* application returned a code in 247ms with zero interaction when the
user held a role there, and authentik's `Permission denied` page in ~220ms when they did not. So the
IdP — never your guard — is what refuses access to an app; your guard only ever decides what a user
who is already allowed in may *do*.

**Superusers do not bypass this.** `akadmin` is in no application group and is refused like anyone
else. That is deliberate; see [open decision 1](#1-which-account-do-you-log-in-with--settled-2026-09-04).

**Changing a group takes effect on the next authorization, not on a live token.** Removing the user
from the group while a token was live: `userinfo` reflected it immediately, but the issued JWT kept
its role claim until it expired. **Revocation latency is therefore one access-token lifetime**, and
that is now **30 minutes, not 5** — `accessTokenValidity` was raised on 2026-09-05 because renewal
turned out to be a top-level navigation rather than an invisible iframe request, and a full page
reload every 5 minutes is unusable. A fresh `/authorize` after the removal was refused.

That trade was made deliberately and is the cheaper half of
[open decision 3](#3-offline_access--refresh-tokens): the alternative, binding `offline_access`, buys
invisible renewal at the cost of a long-lived credential sitting where JavaScript can reach it.
**If revocation latency ever matters more than reload comfort, lower this number — it is one line in
`homelab` → `authentik-blueprints/values.yaml`.**

## 4. Token shape

Both the ID token and the access token are RS256 JWTs. Verbatim from a real token, 2026-09-04:

```
id_token      acr amr aud auth_time email email_verified exp given_name iat iss jti
              name nickname picture preferred_username roles sid sub

access_token  … the same, plus  azp  scope  uid
```

```jsonc
{
  "iss":   "https://auth.irha.cz/application/o/qr-manager-server1-sandbox/",  // per application
  "aud":   ["qr-manager-server1-sandbox"],   // ALWAYS an array, even with one entry
  "sub":   "t-final",                        // the USERNAME, not a UUID
  "azp":   "qr-manager-server1-sandbox",
  "roles": ["qr-manager.admin"],             // <app>.<role> — no cluster, no stage
  "preferred_username": "t-final",
  "exp":   "iat + 300"
}
```

**`roles` is what you authorize on.** `<app>.<role>`, lowercase, and deliberately free of the
environment: `qr-manager.admin` is the **same string** on server1 sandbox and server2 production.
Your handler's constant never changes.

The IdP-side group is `qr-manager-server1-sandbox-admin` — Authentik group names are globally unique,
so the environment has to be in the object name. A property mapping strips it. You never see it.

Four things to build against:

- **Request the scope.** `scope=openid profile email roles`. **Omit `roles` and the claim is simply
  absent** — verified. The API then denies everything, which is the safe direction but a confusing
  hour. Put the exact scope string in the SPA's config and assert it in a test.
- **`aud` is always an array** — a one-element one today, longer once a login may call several APIs
  ([§7](#7-one-login-many-apis)). **Check membership, never equality.** The array is emitted from day
  one deliberately: `aud === "qr-manager-server1-sandbox"` would otherwise work for months and break
  on the day a second audience appeared, far from the commit that caused it. Now it fails on the first
  request instead. **The array comes from the local `profile` scope mapping**, not from the provider —
  so a client that requests a scope string without `profile` gets Authentik's default bare string back
  and loses every user claim besides. One more reason the scope string in §6 is exact rather than
  indicative.
- **There is no `groups` claim.** It used to exist and carried *every* group the user was in, across
  all applications and clusters. It was removed on 2026-09-04 because a sandbox token was naming the
  user's production memberships. If you see it, you are looking at a stale token or a stale doc.
- **`sub` is the username** (`sub_mode: user_username`). Renaming a user changes their `sub`. See
  [open decision 2](#2-sub-is-the-username).

### Keep the claim shape in one place

`roles` is **not** a standardised claim. Nothing in OIDC Core defines authorization claims at all —
`iss`, `sub`, `aud`, `exp`, the `profile` and `email` scopes and their claims, discovery, JWKS and
PKCE are all specified and portable, but "what may this user do" is vendor-specific **everywhere**.
Keycloak would deliver the same fact as `resource_access.<client>.roles`; Entra ID as `roles` or
`groups` of GUIDs.

The name `roles` was chosen because RFC 9068 (*JWT Profile for OAuth 2.0 Access Tokens*) uses it for
exactly this, borrowing the semantics from SCIM. It is the closest thing to a standard spelling.

**So: read `roles` in exactly one adapter** — the code that turns a verified token into a `Principal`
— and let everything downstream use `Principal.roles`. That is already what P1.0's `ITokenVerifier`
contract requires, for a different reason. It also means a change of IdP is one function, not a sweep
through every handler.

## 5. Rules for a backend verifying these tokens

The access token is a self-contained JWT, so verification is offline — one JWKS fetch, cached, then
pure computation. No introspection call on the request path.

1. **Verify RS256 against the JWKS**, keyed by the token's `kid` — and fetch it from
   **`/application/o/<this API's own client_id>/jwks/`**, never a shared or hardcoded URL. Today every
   app's JWKS returns the same key, so this looks like a distinction without a difference. It is not:
   it is the single line that makes [trap 1](#trap-1--one-signing-key-for-every-application) fixable
   at the IdP later with **no change here**. Get it wrong now and the fix becomes a code change across
   every API.
2. **Check `aud` by membership — this is not optional.** All five providers **share one signing
   key**: the same `kid`, and a token minted for `qr-manager-server1-sandbox` verifies cleanly against
   `qr-manager-server2-production`'s JWKS URL. Verified by doing exactly that. A valid signature
   proves the token came from this IdP and **nothing about which application it was for**. Without an
   `aud` check, a token for the sandbox SPA is accepted by the production API. **`aud` is always an
   array** — treat it as a set that must contain your own `client_id`.
3. **Check `iss`, and get it from discovery rather than a constant.** Each application issues under
   `https://auth.irha.cz/application/o/<client_id>/` (trailing slash included), so `iss` is a second,
   independent answer to "was this token minted for me" — which matters because of rule 2. It is also
   the check you are least likely to skip: a client constructed from a discovery document pins the
   issuer structurally, because the client *is* the issuer, whereas `audience` is an optional argument
   in every JWT library. **Prefer `openid-client`-style discovery over a raw `jose.jwtVerify`** for
   exactly that reason — with a raw verify, omit both options and neither claim is checked.
4. **Authorize on `roles`**, matching `<app>.<role>` — `qr-manager.admin`. The same constant in every
   environment; the environment was already settled by rules 2 and 3, one layer up. A `roles` claim
   that is *absent* means the client forgot the `roles` scope: deny, and say so distinctly enough that
   the next person does not go hunting in the IdP.
5. **Cache the JWKS by `kid` with a bounded refresh.** One key today; do not hardcode it — the
   signing certificate is rotatable and the `kid` changes when it rotates.
6. **Accept that revocation lags by 5 minutes** (§3). If something must be revocable faster, it needs
   `userinfo` or introspection on the request path, which is a different design — do not add it
   speculatively.
7. **Do not key durable rows on `sub`** while `sub_mode` is `user_username`.

`ITokenVerifier` from P1.0 covers all of this without changes: this is one issuer row with a remote
JWKS. The contract constraints P1.0 was told to preserve (async, room for "could not determine")
remain right — see [blocker 1](#blocker-1--api-pods-cannot-reach-the-idp--fixed-and-verified-2026-09-04), which is precisely a
transport failure distinct from a verification failure.

## 6. Rules for a frontend

Confirmed working end to end, headlessly, against the live IdP:

- authorization code + **PKCE S256**, public client, **no `client_secret` on the token request**
- `state` round-trips; `nonce` is echoed into the `id_token`
- the authorization code is **single-use** — replay returns `400 invalid_grant`
- **PKCE is enforced**: exchanging without `code_verifier` returns `400 invalid_grant`
- an **unregistered `redirect_uri`** is refused at `/authorize` with a `Redirect URI Error` page —
  it does not redirect anywhere
- **CORS works, and it is origin-locked on the responses that matter.** The preflight is permissive —
  `OPTIONS /token` reflects **any** `Origin`, unregistered ones included, with
  `Allow-Methods: GET, POST, OPTIONS` and `Allow-Headers: content-type`. The **real** response is
  where the lock is: `POST /token` returns `Access-Control-Allow-Origin` plus
  `Access-Control-Allow-Credentials: true` **only** for an origin belonging to a registered redirect
  URI, on success and on `400` alike. An unregistered origin gets no header at all and the browser
  blocks the read. `/userinfo` behaves the same way.

  So do not debug a CORS failure by staring at the preflight — it will look fine either way. The
  registered redirect URI is what decides.

**Keep the access token in memory.** A reload re-obtains one silently rather than persisting it —
see [trap 2](#trap-2--there-is-no-refresh-token) for why that is the only option anyway.

**Silent renewal works, but NOT in an iframe.** `GET /authorize?…&prompt=none` against an established
session returns `302` straight to the callback with a fresh code. Two facts were read as making the
hidden-iframe variant viable here, contradicting the warning written for Zitadel:

- the `authentik_session` cookie is `HttpOnly; Secure; SameSite=None`, so it is sent in an iframe
- `auth.irha.cz` and `apps.*.homelab.irha.cz` share the registrable domain `irha.cz` — same-site

> **Corrected 2026-09-05, in a real browser against server1 production.** Both facts above are true
> and both are irrelevant, because **Authentik sets `X-Frame-Options: DENY` on every response**:
>
> ```
> $ curl -sI https://auth.irha.cz/ | grep -i x-frame
> x-frame-options: DENY
> $ curl -sI 'https://auth.irha.cz/application/o/authorize/?…&prompt=none' | grep -i x-frame
> x-frame-options: DENY
> ```
>
> The browser refuses to render any Authentik page inside a frame:
> `Refused to display 'https://auth.irha.cz/' in a frame because it set 'X-Frame-Options' to 'deny'.`
>
> The cookie was never the binding constraint. Framing is refused outright, so the hidden-iframe
> strategy is not available **at all** — not for renewal, not for reload recovery, and not for the
> *Permission denied* page that [trap 3](#trap-3--promptnone-does-not-always-redirect) is about.
> A `302` that passes straight through is not blocked, so the failure is intermittent by nature:
> it appears only on the paths where Authentik actually renders a page. That is the worst shape a
> bug of this kind can have.
>
> **A top-level navigation is therefore required, not merely simpler.** `check_session_iframe` is
> absent from discovery, consistent with this.

**No `offline_access`, so no refresh token — confirmed from discovery**, not inferred:
`scopes_supported` is `["profile", "roles", "openid", "email"]`. The provider *would* accept the
grant — `grant_types_supported` includes `refresh_token`, and the blueprint sets
`grant_types: [authorization_code, refresh_token]` — so this is one scope mapping away, not a
redesign. See [open decision 3](#3-offline_access--refresh-tokens), which this finding reopens:
with the iframe gone, a refresh token is the only way to renew without a full page navigation.

**Logout** — `GET /application/o/<client_id>/end-session/?id_token_hint=…&post_logout_redirect_uri=…`
redirects through the invalidation flow and lands on the registered post-logout URI. See
[trap 3](#trap-4--logout-does-not-end-the-idp-session) for what it does *not* do.

### Where the config goes

`issuer`, `client_id`, redirect URI and API origins are all **non-secret** — a public client has
nothing to hide — so they belong in the runtime `config.json` that nginx already serves publicly,
consistent with [`2026-08-08-dashboard-credential-boundary.md`](./archive/2026-08-08-dashboard-credential-boundary.md).

Two repo rules apply to adding them:

- **`RuntimeConfigSchema` is validated by an initContainer** running the app's own Zod schema before
  nginx starts (`templates.config.validate: true`). The schema is the contract; the validator image
  is `ghcr.io/radoslavirha/qr-manager-ui-config-validator:<image.tag>`.
- **The `auth` block is REQUIRED, not optional** — decided 2026-09-05, overriding the
  backward-compatibility rule in AGENTS.md for this change. A homelab deployment tolerates downtime,
  and an optional block buys a "renders without a login button" code path that exists only to cover a
  window between two deploys. Required means the initContainer refuses to start a UI whose config
  lacks `auth`, which is the failure everyone wants: loud, at deploy time, in one place.
  **The consequence is a coupled release** — the `homelab` values change lands with (or before) the
  UI image that requires it. `homelab` adds the keys to
  `gitops/helm-values/apps/qr-manager-ui/{sandbox,production}.yaml` under
  `templates.config.content`, in the same `{{ VAR_* }}` style already there. Sandbox first; a
  mismatch there is a CrashLoopBackOff on the initContainer, not a broken login.

**Use these key names in both UIs**, so the two do not diverge and the `homelab` values files stay
copy-pasteable. One required `auth` block, added to what is already there:

```jsonc
{
  "apiBaseURL": "https://api.sandbox.server1.homelab.irha.cz/iot/qr-manager",
  "basePath": "/qr-manager",
  "auth": {                                    // REQUIRED — the config validator rejects a config without it
    "issuer": "https://auth.irha.cz/application/o/qr-manager-server1-sandbox/",  // per deployment
    "clientId": "qr-manager-server1-sandbox",
    "scope": "openid profile email roles",     // omit `roles` and the API denies everything
    "redirectUri": "https://apps.sandbox.server1.homelab.irha.cz/qr-manager/callback",
    "postLogoutRedirectUri": "https://apps.sandbox.server1.homelab.irha.cz/qr-manager/"
  }
}
```

**`redirectUri` is an absolute URL, spelled out — do not derive it** from
`window.location.origin + basePath + '/callback'`. Matching is strict, and a derived value that is off
by a trailing slash fails at the IdP with an opaque `Redirect URI Error` page rather than anywhere you
would think to look. Spelled out, it can be diffed directly against
`homelab` → `gitops/helm-values/server3/authentik-blueprints.yaml`, which is what generates the
registered value.

---

## 7. One login, many APIs

Today each SPA calls one API and the two share an Application, so this section describes nothing you
have to build yet. It is here because **the group naming already commits to it**, and re-modelling it
later would be expensive.

**Groups name the resource — the API — not the client that logs in.** Today they coincide:
`qr-manager` is a UI and an API that ship together. Tomorrow another product's UI may call
`qr-manager-api`, and `qr-manager.editor` will still mean *may create QR codes*, whichever UI the user
came through. That is the point of putting the app short name in the claim rather than the client's.

**SSO makes the multi-app case cheap.** Verified 2026-09-04: with a session established through one
application, `/authorize` for a *different* application returned a code in **247ms with zero
interaction** — no password, no consent screen. So "hold a second token for a second API" costs a
redirect flash, not a login. If the user has no role in that second application, they get authentik's
`Permission denied` page instead, in ~220ms.

**A client cannot widen its own reach.** `audience=` and `resource=` on the authorization request are
ignored — measured. Extra audiences can only be granted server-side, by the IdP. So an API is never
exposed to a UI that simply asked nicely.

**When it arrives**, the shape is an `accesses` list in
`homelab` → `gitops/helm-values/server3/authentik-blueprints.yaml`, naming the other resources a login
may reach. `aud` then carries more than one entry, and each is granted **only for resources the user
actually holds a role in** — so a token is not even *addressed* to an API the user has no business
calling. The claim is already an array today precisely so that day changes nothing in this repo.

**Where it does not fit:** if the second API belongs to a different product, sharing one token would
mean authorizing on *which UI called* rather than *what this user may do* — a `qr-manager` reader
would inherit access for free. There, the honest answer is a second login, which SSO makes nearly
invisible.

### The audience dial, and why this repo is not doing what your last job did

Worth stating explicitly, because "one login reaches every API I'm allowed" is the shape most people
arrive with, and it is **a policy choice, not a different protocol**. Four ways it is usually done:

| pattern | what makes one token work everywhere |
| --- | --- |
| shared audience | every API accepts `aud: <platform>` and authorizes purely on roles |
| scopes separate | `scope: "orders:read invoices:write"`, each API checks its own, `aud` ignored |
| **API gateway** | the edge validates once and forwards identity headers; backends never see the token |
| per-resource audience | a token per API — **what this repo does** |

**The audience and the login gate are independent dials.** Per-application gating at `/authorize` is
untouched by any of this. A broad audience would still refuse you at login for an app you hold no role
in.

**Narrow is the current default because it costs nothing yet** — one UI, one API. It is not a law. The
mapping already grants an audience *only for resources the user holds a role in*, so widening the
`accesses` list yields exactly "every API where my user is allowed", with least privilege intact.
What you trade: with a broad audience, XSS in any SPA reaches every API, and any API you call can
replay your token against the others — the confused-deputy shape that per-resource audiences exist to
prevent.

**The gateway pattern is not planned here, and the reason is not purity.** It moves verification
rather than removing it, adds a runtime dependency on the path of every request (a cached JWKS keeps
APIs working when the IdP is down; a gateway does not), and makes backends trust headers — which is
only as strong as the guarantee that nothing can reach them directly. In this cluster other pods share
the namespace, so that guarantee would be a new NetworkPolicy invariant to maintain rather than a
property we already have. Per-API verification is a `jose` call and a config block; the Phase 1 work
packages are mostly framework, not cryptography.

Nothing stops a gateway being added later for defence in depth. It is not either/or.

### Postman is the trigger for `accesses`

The first real use case, recorded so it is not rediscovered. A dedicated `postman` `client_id` is the
right shape — and on its own it reaches **nothing**, because its token carries `aud: postman-…` and
roles filtered to `postman-*` groups. That is the design working, not a bug.

To make it useful: a `postman` Application with an `accesses` list, gated by its own group so it can
be revoked without touching any SPA's client. Verified 2026-09-04 that Postman's flow works against a
registered client with either callback; prefer `http://localhost:PORT/callback` over
`https://oauth.pstmn.io/v1/callback` — authentik accepts plain HTTP on localhost, and it keeps the
code off a third party's servers, which matters more once a token carries several audiences.

**Not needed until an API actually enforces.** Today `curl` returns everything, so Postman needs no
token at all. Build it in the same pass as the first enforcing API.

**When it is built, it is the one client that should be broad.** The working pattern is a Postman root
folder holding the auth, with every collection inheriting it — one token, all APIs. A narrow audience
breaks that: each API would need its own token, its own auth block, and its own browser round trip.
Not a password each time (SSO keeps those silent), but N tokens to manage instead of one.

`accesses` is per Application, so this needs no compromise anywhere else:

| client | `accesses` | why |
| --- | --- | --- |
| `qr-manager-ui` and other SPAs | narrow — itself | downloadable JavaScript; keep the blast radius at one API |
| `postman` | broad — every API | a tool you drive by hand, on your own machine |

Still not god mode: the mapping grants an audience **only where the user holds a role**, so the
Postman token covers exactly "the APIs I am allowed to call" and silently omits the rest.

**Two settings this client should NOT inherit from the SPA defaults:**

- **Bind `offline_access`.** [Open decision 3](#3-offline_access--refresh-tokens) rejected refresh
  tokens *for browsers*, because a 30-day credential in `localStorage` is reachable by XSS. Postman is
  not a browser and has no XSS surface — it stores the refresh token in a desktop app on your machine.
  Without it you re-authorize every 5 minutes, which is the kind of friction that ends with someone
  disabling auth to get work done.
- **Consider a longer `access_token_validity`.** It is a per-provider attribute, so this client can
  carry a longer one without touching the SPAs. Trade it against §3's revocation latency, which
  matches the token lifetime.

Both are per-Application in the blueprint, so neither weakens anything the browsers use.

## Traps

### Trap 1 — one signing key for every application

Covered in [§5 rule 2](#5-rules-for-a-backend-verifying-these-tokens). Repeated here because it is the
one that produces a security hole rather than a crash: **signature valid ≠ token was for you.**

**Three things already blunt it**, which is why this is a trap and not an emergency:

- **`iss` is now per-application too** (`issuer_mode: per_provider`, settled 2026-09-04). A token from
  another app fails the issuer check as well as the audience check — and the issuer check is the one a
  discovery-built client makes whether you remember it or not.

- **`roles` is scoped to the issuing application.** The property mapping filters to the groups
  belonging to *this* `client_id`, so a token never carries another application's roles. Verified: a
  user holding roles in two applications got only the issuing one's in each token. A route checking a
  role therefore cannot be satisfied by a token from elsewhere. The residual exposure is routes that
  require authentication and no particular role.
- **The realistic attacker barely exists.** It takes someone with sandbox access but not production
  access. Today that is one account — `radoslav`, sandbox-only — and its owner can self-elevate
  through `akadmin`, so it is not a real privilege boundary. It does mean the `aud` check now covers
  something real rather than something hypothetical.

**The planned structural fix, when it is worth doing: per-provider signing keys.** Each application's
JWKS would then contain only its own key, so a wrong-app token fails at the *signature* step — no
`aud` parameter to remember, no per-route discipline. It is `homelab` work (cert-manager issues one
certificate per provider; authentik discovers them; the blueprint points each provider at its own).
**It requires nothing from this repo — provided §5 rule 1 is followed.** An API already fetching its
own application's JWKS URL gets the upgrade for free.

Note this is also why the `aud` check is not made redundant by any of the above: it is what covers the
role-free routes until the keys are split.

### Trap 2 — there is no refresh token

The provider lists `refresh_token` in `grant_types` and a 30-day validity, and the token response
still contains **no `refresh_token`**. Requesting `scope=offline_access` explicitly does not change
it — the `offline_access` scope mapping exists in authentik
(`goauthentik.io/providers/oauth2/scope-offline_access`) but is **not bound to these providers**;
only `openid`, `email` and `profile` are.

**Consequence: a 5-minute access token with no refresh path except `prompt=none`.** The SPA must
silently re-authorize before expiry, and handle the failure modes below. This is a defensible
default — no long-lived credential sits in a browser — but it is a *decision*, not an oversight, and
[open decision 3](#3-offline_access--refresh-tokens) is where to change it.

### Trap 3 — `prompt=none` does not always redirect

Three different outcomes, and a naive iframe implementation only handles the first two:

| Situation | Response |
| --- | --- |
| session valid, user allowed | `302` to the callback with a code |
| **no session at all** | `302` to the callback with `error=login_required` — well behaved |
| **session valid, user NOT in the app's group** | **`200` with an HTML `Permission denied` page. No redirect at all** |

The third case is the trap: a hidden iframe never posts anything back, so the SPA waits forever.
**Put a timeout on silent renewal and treat expiry as "not authorized", not as "network problem".**

### Trap 4 — logout does not end the IdP session

`default-provider-invalidation-flow` — the flow every one of these providers points at — **has no
stages bound to it.** RP-initiated logout therefore redirects correctly to the post-logout URI and
leaves the authentik session intact. Verified: after a full `end-session` round trip, `prompt=none`
still returned a code.

For the user this means pressing **Log out** and then **Log in** signs them straight back in with no
prompt. On a shared browser, logout did not log out.

Handle it in the SPA by offering a second action — *Sign out everywhere* — pointing at
`https://auth.irha.cz/flows/-/default/invalidation/`, which does have the logout stage bound.
[Open decision 4](#4-should-logout-be-a-real-logout) is whether to change the IdP instead.

---

## Blockers

### ~~Blocker 1 — API pods cannot reach the IdP~~ — fixed and verified 2026-09-04

`auth.irha.cz` resolves in-cluster to `192.168.1.202` — server3's Traefik on the LAN — and the
namespace's only outbound rule, `allow-egress-internet`, is `0.0.0.0/0` **minus `192.168.0.0/16`**.
So the IdP sat on the wrong side of the one exclusion that rule makes, and a JWKS fetch from a
running pod timed out.

`homelab` commit `0b903db` adds `NetworkPolicy.egress-idp.yaml` to all four namespaces
(server1 and server2 × sandbox and production), opening exactly `192.168.1.202/32` on TCP 443.
Synced and verified from a `qr-manager-api` pod in each:

```
server1 sandbox     JWKS OK 274ms
server1 production  JWKS OK 508ms
server2 sandbox     JWKS OK 358ms
server2 production  JWKS OK 343ms
```

The rule is as narrow as it looks — from the same pod, `192.168.1.201:443` (server2's Traefik) and
`192.168.1.1:443` (the router) still time out, and public HTTPS still works through
`allow-egress-internet`.

**Worth remembering when this breaks again:** a blocked JWKS fetch is a *hang*, not a refusal. An API
that cannot reach the IdP does not log "forbidden" — it stalls for whatever timeout its HTTP client
carries. Give the JWKS fetch an explicit timeout, and treat "could not determine" as its own outcome
rather than folding it into "invalid token".

### ~~Blocker 2 — no human account is in any group~~ — resolved 2026-09-04

`radoslav` exists, is **not** a superuser, and is in exactly one group:
`qr-manager-server1-sandbox-admin`. `akadmin` stays untouched as break-glass.

Verified through authentik's own policy engine (`check_access`, per application):

| application | passing |
| --- | --- |
| `qr-manager-server1-sandbox` | **True** |
| `qr-manager-server1-production` | False |
| `qr-manager-server2-sandbox` | False |
| `qr-manager-server2-production` | False |
| `homelab-dashboard-server3-production` | False |

One app open, four shut, from one group membership. **P1.F1 has a real account to log in with**, and
it also has a ready-made negative test: the same user against any of the other four is refused with
`Permission denied` and no code — no second account needed to prove the gate.

Widening to the other environments is one group membership each, whenever you want them.

## Open decisions

### ~~1. Which account do you log in with~~ — settled 2026-09-04

A personal account (`radoslav`), in the groups it needs and nothing else, with `akadmin` kept as
break-glass. See [blocker 2](#blocker-2--no-human-account-is-in-any-group--resolved-2026-09-04).

Rejected: adding `akadmin` to the groups. An administrator silently entitled to every application is
exactly the property the per-app gate was built to remove — and since `sub` is the username, every
token and audit row would have read `akadmin`.

### 2. `sub` is the username

`sub_mode: user_username` makes tokens readable and makes a rename an identity change. The
alternative is `hashed_user_id`, which is stable and opaque.

**Recommendation: leave it** until something in this repo stores per-user rows. It is a one-line
blueprint change, and it is cheap now precisely because nothing persists a `sub` yet. Revisit before
the first feature that does — changing it later orphans stored rows.

### 3. `offline_access` / refresh tokens

Binding the `offline_access` scope mapping to the providers would issue refresh tokens.

**Recommendation: still do not — and the cheaper move was taken instead.** A refresh token would not
replace the session cookie, it would add a second *long-lived* credential on top of it, in the one
place JavaScript can reach ([trap 2](#trap-2--there-is-no-refresh-token)).

The "revisit if silent renewal proves unreliable in a real browser" clause fired on 2026-09-05, and
for a reason this document did not anticipate: not cookie policy, but `X-Frame-Options: DENY`, which
makes the iframe path impossible rather than unreliable. Renewal is now a top-level navigation.

That made 5-minute tokens unusable — a full page reload every five minutes — so **`accessTokenValidity`
was raised to 30 minutes**, which is exactly the cheaper first move this section already named. The
cost is revocation latency growing to match (§3). `offline_access` remains unbound.

### ~~4. Should logout be a real logout~~ — settled 2026-09-05: yes

The providers now bind **`default-invalidation-flow`** instead of `default-provider-invalidation-flow`.
It runs the `user_logout` stage and then honours `post_logout_redirect_uri`, so one ordinary
`signoutRedirect()` ends the authentik session and returns the user to the app.

Decided earlier than "when there are two frontends" because the gated UI made the old behaviour
actively misleading: log out, land on the sign-in page, click *Sign in*, and you were back in without
typing anything. That reads as broken. The *Sign out everywhere* button that used to paper over it is
gone, and with it the last hardcoded IdP hostname in `@radoslavirha/ui-auth`.

**The consequence is real and global:** logging out of any one application signs the session out of
all of them, across both clusters and both stages — verified in a browser. There is no "log out of
this environment only", and nobody should be told there is.

### ~~5. `issuer_mode`: global, or per application~~ — settled 2026-09-04: `per_provider`

Measured on the live provider (set, observed, reverted), then adopted:

| | `global` (was) | `per_provider` (is) |
| --- | --- | --- |
| `iss` | `https://auth.irha.cz/` — same for all five | `https://auth.irha.cz/application/o/<client_id>/` — unique per app |
| `jwks_uri` | already per-app | already per-app |
| authorize / token endpoints | shared | **unchanged, still shared** |
| signing key | shared | **still shared** — issuer mode does not touch keys |

**Why.** With one shared signing key, `aud` was the only claim separating the applications, and `aud`
is an optional argument in every JWT library — omit it and nothing complains. `per_provider` adds a
second discriminator that a discovery-built client pins structurally.

**Why now rather than later.** It costs one line while no verifier exists and no token is in
circulation. After P1.F1 and P1.2 land, the same change means updating every deployment's config *and*
breaking live tokens until their next renewal. Free today, fiddly next month, same benefit.

**What it is not:** a fix for the shared signing key, and not a reason to skip the `aud` check. Both
still apply — see [trap 1](#trap-1--one-signing-key-for-every-application).

---

## Cross-environment behaviour — verified in a browser 2026-09-05

One browser session, `claude`, against all four deployed `qr-manager` applications on `0.10.1`.

**SSO spans clusters and stages.** Signed in on `server1` sandbox only, the other three
(`server1` production, `server2` sandbox, `server2` production) all rendered signed-in with **no login
form and no interaction**. The `authentik_session` cookie is scoped to `auth.irha.cz`, so it is not
per-cluster and not per-stage.

**Logout is global, by design and in fact.** Logging out of `server2` production signed the session
out of all four, including the other cluster. That follows from the providers binding
`default-invalidation-flow`; the alternative leaves the session alive and makes *Log out* a no-op.
**Anyone expecting "log out of this environment only" will be surprised** — there is no such action.

**Tokens are per application, and that is the only thing separating the environments:**

| application | `iss` | `aud` | `roles` |
| --- | --- | --- | --- |
| `qr-manager-server1-sandbox` | `.../qr-manager-server1-sandbox/` | `[qr-manager-server1-sandbox]` | `qr-manager.admin`, `qr-manager.reader` |
| `qr-manager-server1-production` | `.../qr-manager-server1-production/` | `[qr-manager-server1-production]` | *identical* |
| `qr-manager-server2-sandbox` | `.../qr-manager-server2-sandbox/` | `[qr-manager-server2-sandbox]` | *identical* |
| `qr-manager-server2-production` | `.../qr-manager-server2-production/` | `[qr-manager-server2-production]` | *identical* |

**`roles` is byte-identical in all four**, which is the intended design (§4) and has a consequence
worth stating plainly: **a token cannot be told apart by its roles.** A sandbox token presented to a
production API carries exactly the roles a production token would. Only `iss` and `aud` distinguish
them, which is what makes `issuer_mode: per_provider` load-bearing rather than a nicety, and why §5
insists on checking `aud` by membership and pinning `iss`.

Nothing verifies any of this yet: no API in this repo checks a token, so a sandbox token replayed
against production is currently accepted everywhere, because nothing is looking. That is Phase 1b.

Access token lifetime is **1800s** in all four, per the raised `accessTokenValidity`.

## What is NOT verified

- ~~**No real browser has done this.**~~ — done 2026-09-05. Login, reload, logout and cross-environment
  SSO were all driven in Chromium against the live IdP, on the deployed apps and on `pnpm dev`. It
  found four things headless testing could not: `X-Frame-Options` killing the iframe, an app usable
  while signed out, a permanent `Loading…` where the sign-in page belonged, and an authorization code
  exchanged twice per login. See the `verify-auth-in-browser` skill.
- **Backend verification has never run.** The pods can now reach the JWKS (blocker 1 is fixed), but no
  code in this repo has verified a token yet — so the `roles` claim has never been read by an API.
- **`accesses` / multi-audience is designed, not built** (§7). `aud` is a one-element array today.
- **`client_credentials` for service-to-service is untested.** These five clients are public;
  service identities need confidential clients, which do not exist yet. That is `homelab` A5.
- **EMQX has not been pointed at the JWKS.** MQTT still uses `built_in_database` credentials.
- **Grafana is not behind the IdP.**

## Reproducing the verification

The awkward part is logging in without a browser. Authentik's flow executor API does it in four
steps, and the two non-obvious details are worth writing down because both cost time:

1. `GET /application/o/authorize/?…` returns `302` to `/if/flow/<slug>/?<query>`.
2. Call the executor as
   `GET /api/v3/flows/executor/<slug>/?query=<the flow page's query string, urlencoded whole>`.
   **Passing that query string raw instead of wrapped in a single `query=` parameter silently drops
   `next`** — login then succeeds and dumps you on `/if/user/` with no code, which looks exactly like
   a refusal.
3. Walk the stages, `POST`ing JSON to the same executor URL with a cookie jar:
   `ak-stage-identification` ← `{"uid_field": "<username>"}`, then
   `ak-stage-password` ← `{"password": "…"}`. **A `302` back to the executor means "stage advanced,
   re-`GET` me"** — it is not a failure and not the final redirect. No CSRF header is needed.
4. The terminal stage is `xak-flow-redirect`, whose `to` is the callback URL carrying `code=`.
   A refusal instead ends on a `200` HTML page titled `Permission denied - authentik`.

Then `POST /application/o/token/` form-encoded with `grant_type=authorization_code`, `code`,
`redirect_uri`, `client_id` and `code_verifier` — and no secret.

Throwaway users can be created and deleted through `/api/v3/core/users/` with the bootstrap token
from the `authentik-secrets` Secret in the `authentik` namespace on server3. Delete them afterwards;
the verification above did.
