# @radoslavirha/auth

Framework-agnostic authentication: the `Principal` every mechanism resolves to, the vocabulary for why
a credential was accepted or refused, the seams implementations plug into, the configuration schema,
the shared test kit — and the JWT verifier itself.

**It reads no request.** Extraction is a transport's job; this package decides, and the Ts.ED guard in
`@radoslavirha/tsed-auth` applies the decision. That split is what keeps every outcome testable
without a server.

Design and roadmap: [`docs/superpowers/specs/2026-09-05-auth-design.md`](../../docs/superpowers/specs/2026-09-05-auth-design.md).

## What is in here

| Export | What it fixes |
| --- | --- |
| `Principal` | One shape every mechanism resolves to — IdP JWT, Kubernetes SA JWT, API key, MQTT identity. Downstream code never learns which produced it |
| `VerifierType` | `bearer-jwt`. How an entry's credentials are checked — the `type` field, and the discriminant of `VerifierSchema` |
| `VerificationReason` | `ok`, `missing`, `invalid`, `wrong-audience`, `unknown-issuer`, `indeterminate` |
| `VerificationOutcome` | Discriminated union, so "verified" and "has a principal" cannot drift apart |
| `ITokenVerifier` | Credential in, outcome out. Async, never throws for a bad credential |
| `IKeySource` | The seam between inline static keys and a remote JWKS |
| `AuthConfigSchema` | Zod. The `auth` block *is* the method map — the runtime's view, every method optional |
| `createAuthConfigSchema` | The same map tied to the methods a service's routes ask for — each becomes a **required** key |
| `mintTestToken`, `FakeTokenVerifier` | Shared test kit, so later units do not each invent one |
| `JwtVerifier` | Verifies a JWT against the configured trust sources and yields a `Principal` |
| `StaticKeySource` | Serves keys carried inline in the configuration — no network, no cache |
| `RemoteJwksSource` | Serves keys from a remote JWKS: selected by `kid`, cached, bounded refresh, hard timeout |
| `UnresolvableKeyError` | Marks a key failure as the *token's* fault, so it reports `invalid` rather than `indeterminate` |
| `Authenticator` | Routes a credential to the verifier the route asked for, and returns an allow/refuse decision |
| `describeAuthConfig` | The boot-time summary: every trusted issuer, and where its keys come from |
| `recordVerification` | The outcome counter |

## Three decisions worth knowing

**The outcome strings are load-bearing in three places at once** — metric label values, log vocabulary,
and the HTTP status mapping. They are defined once, here, and used verbatim. Three units inventing
three spellings for the same condition is the failure this prevents.

**`indeterminate` is not `invalid`.** A JWKS fetch is I/O and can fail; the credential may be perfectly
good and we simply cannot say. Collapsing the two would report an outage as a wave of bad tokens and
make `enforced` indistinguishable from a broken IdP.

**Kubernetes is not a special case.** A ServiceAccount token is "an issuer whose JWKS fetch happens to
need a bearer token" — `key.auth: serviceAccountToken` in configuration, not a branch in the verifier.
Delete the row and the same binary runs on a VM.

**The algorithm allowlist comes from configuration, never from the token.** Trusting the JWS header's
own `alg` is the classic JWT failure — `alg: none`, or an RSA public key accepted as an HMAC secret.
Both are covered by tests.

**A key failure has two meanings and they must not collapse.** An unknown `kid` or a mismatched
algorithm is the credential's fault and reports `invalid`; a timeout or refused connection is the key
source's fault and reports `indeterminate`. Key sources signal the first by throwing
`UnresolvableKeyError`, so the verifier never has to know which sources exist. Getting this backwards
files an attack under "the IdP might be down".

**A JWKS fetch is bounded three ways.** `timeoutMs` aborts a hanging endpoint — a hang is worse than a
refusal, because it exhausts the connection pool and takes down routes that need no authentication at
all. `cacheTtlSeconds` keeps the IdP off the per-request path. `refreshCooldownMs` stops a stream of
tokens carrying unknown `kid`s from becoming a fetch per request, which would turn a bad token into a
denial of service against the IdP.

**The ServiceAccount token is re-read on every fetch.** The kubelet rewrites the projected file at
roughly 80% of its lifetime, so a token read once at construction works for about an hour and then
fails in a way that looks like a permissions problem, long after the deploy that could be blamed.

**`indeterminate` answers `503`, not `401`.** Every other reason is a statement about the credential;
that one is a statement about us. A `401` when our own JWKS fetch timed out blames a token that was
never the problem, and is not retriable — a client backing off correctly on a `503` would give up
instead.

**There is no way to say "not really on".** No disable flag, no observe-only mode. Every such switch
is a state where a forgotten key in a values file leaves a service up, healthy and unauthenticated —
which is exactly the failure the switch was added to prevent. A route is guarded by `@Authenticate()`
or opened by `@Anonymous()`, and both are visible in the source next to the route.

**A name is not a mechanism.** An entry's *name* says which callers a route admits;
`VerifierType.BearerJwt` says how their credentials are checked, as the entry's `type` in
configuration. Conflating them capped the design at one entry per mechanism — one `jwt` key meant every
guarded route shared one list of trusted issuers, so a cluster's ServiceAccount token was accepted
anywhere a person's was. Two entries of the same type is the ordinary case, not the exotic one.

**The names belong to the service, not to this package.** Which callers a deployment admits — its
people, its cluster, its devices — is knowledge no shared package has, and a name like `homelab` baked
into a library would be wrong the first time something ran anywhere else. Each service declares its own
enum and hands it to `createAuthConfigSchema`, exactly as it declares `ExternalApi` and hands it to
`createExternalApisSchema` on the outbound side. This package takes plain strings.

**A configuration that cannot work fails at boot, not at the first request.** A `bearer-jwt` entry must
carry at least one trusted issuer, so the schema rejects an empty one. And because the block is a map,
a service declares the names its routes use —
`createAuthConfigSchema(Object.values(AuthMethod))` — and Zod refuses a config that is missing one,
naming `auth.IDP`. The array form this replaced could only count elements after the fact. That schema
is **strict**, so `IPD` is a rejected typo rather than a silently stripped key.

**The `auth` block is nothing but that map.** No wrapper key, no switch, and no route allowlist. An
`anonymousRoutes` list lived here briefly and was deleted: nothing enforced it — `@Anonymous()` does —
so it was a second copy of the truth, free to drift from the routes it claimed to describe. There is
no `dummy` or `allow-all` verifier type either: that is `mode: disabled` wearing a different hat.

**Metric instruments are built per meter provider, never eagerly.** The metrics API has no proxy
provider: an instrument created before the SDK starts is bound to the no-op provider forever, and
every auth metric would silently vanish depending on import order. A test registers a provider *after*
importing the module and asserts the counter still records.

## Observability

| | |
| --- | --- |
| `auth.verifications` | Counter, labelled `auth.outcome` with `VerificationReason`'s strings verbatim |

The issuer is attached as a label **only when one matched** — otherwise anyone could mint unbounded
label values by sending tokens with made-up `iss` claims.

The standing question it answers is "who is being turned away, and why": a rate of `invalid` that
starts at a deploy is a broken caller, a rate of `indeterminate` is our own IdP. Neither is visible in
a boot-time log line.

## Local development is an issuer row, not a bypass

```jsonc
"auth": {
    "IDP": {
        "type": "bearer-jwt",
        "trustedIssuers": [{
            "name": "dev-local",
            "issuer": "dev",
            "audience": "qr-manager-api",
            "subjectKind": "service",
            "key": { "source": "value", "algorithm": "HS256", "value": "local-dev-secret" }
        }]
    }
}
```

Verification is real locally, against an inline HS256 secret. The code exercised on a laptop is the
code that runs in production, and 401 stops being the only path never covered. It also fails closed: a
leftover dev issuer row needs the dev secret to exploit, where a leftover `enabled: false` *is* the
vulnerability.

Where the IdP is reachable — which, for a homelab, is everywhere — the honest local config is the IdP
itself, with `key.source: jwks`. `config/localhost.json` for `qr-manager-api` does exactly that.

## The barrel is owned by this package

`src/index.ts` is written complete, with the exports of unbuilt units listed in the order they land. A
barrel only re-exports, so several units appending to it in parallel is several conflicts on one file.
A later unit fills in its line; it does not decide where to put it.

## Test kit

```ts
import { mintTestToken, testSecretBytes, FakeTokenVerifier, failureOutcome } from '@radoslavirha/auth';

// HS256 with an inline secret: a full signed round trip, no key pair, no network.
const token = await mintTestToken({ claims: { roles: ['qr-manager.admin'] } });

// An already-expired token.
const stale = await mintTestToken({ expiresIn: '-5m' });

// Drive a guard through an outcome a real verifier can barely be made to produce.
const verifier = new FakeTokenVerifier(failureOutcome('indeterminate', 'JWKS timeout'));
```

The kit is exported from the package root so other packages' tests can use it, which does mean a
signing helper ships in the bundle. A deliberate trade for a private, in-repo package.

## Scripts

```bash
pnpm build   # tsc --noEmit && tsdown
pnpm test    # vitest run, with coverage
pnpm lint    # eslint .
```
