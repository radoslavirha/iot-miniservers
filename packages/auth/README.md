# @radoslavirha/auth

Framework-agnostic authentication: the `Principal` every mechanism resolves to, the vocabulary for why
a credential was accepted or refused, the seams implementations plug into, the configuration schema,
the shared test kit — and the JWT verifier itself.

**It verifies nothing on its own.** Wiring it into a service, the mode pipeline and the Ts.ED guard all
arrive later and depend on the names fixed here.

Design and roadmap: [`docs/superpowers/specs/2026-09-05-auth-design.md`](../../docs/superpowers/specs/2026-09-05-auth-design.md).

## What is in here

| Export | What it fixes |
| --- | --- |
| `Principal` | One shape every mechanism resolves to — IdP JWT, Kubernetes SA JWT, API key, MQTT identity. Downstream code never learns which produced it |
| `AuthMode` | `disabled` / `permissive` / `enforced`. Three modes, because "off" and "on" cannot express a service mid-onboarding |
| `VerificationReason` | `ok`, `missing`, `invalid`, `wrong-audience`, `unknown-issuer`, `indeterminate` |
| `VerificationOutcome` | Discriminated union, so "verified" and "has a principal" cannot drift apart |
| `ITokenVerifier` | Credential in, outcome out. Async, never throws for a bad credential |
| `IKeySource` | The seam between inline static keys and a remote JWKS |
| `AuthConfigSchema` | Zod. Every field defaulted, so a service that says nothing gets `disabled` |
| `mintTestToken`, `FakeTokenVerifier` | Shared test kit, so later units do not each invent one |
| `JwtVerifier` | Verifies a JWT against the configured trust sources and yields a `Principal` |
| `StaticKeySource` | Serves keys carried inline in the configuration — no network, no cache |
| `RemoteJwksSource` | Serves keys from a remote JWKS: selected by `kid`, cached, bounded refresh, hard timeout |
| `UnresolvableKeyError` | Marks a key failure as the *token's* fault, so it reports `invalid` rather than `indeterminate` |
| `Authenticator` | Runs the configured mode over a credential and returns an allow/refuse decision |
| `describeAuthConfig` | The boot-time summary: mode, every trusted issuer, and where its keys come from |
| `recordVerification`, `observeAuthMode` | The outcome counter and the mode gauge |

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

**A mode that cannot work fails at boot.** `enforced` or `permissive` with no trusted issuers verifies
nothing, so `Authenticator`'s constructor throws rather than letting the service come up healthy and
refuse every request — which reads as a network fault and gets debugged for an hour.

**Metric instruments are built per meter provider, never eagerly.** The metrics API has no proxy
provider: an instrument created before the SDK starts is bound to the no-op provider forever, and
every auth metric would silently vanish depending on import order. A test registers a provider *after*
importing the module and asserts the counter still records.

## Observability

| | |
| --- | --- |
| `auth.mode` | Gauge, `0` disabled / `1` permissive / `2` enforced. Ordered so an alert is `auth_mode < 2` |
| `auth.verifications` | Counter, labelled `auth.outcome` with `VerificationReason`'s strings verbatim |

The issuer is attached as a label **only when one matched** — otherwise anyone could mint unbounded
label values by sending tokens with made-up `iss` claims.

This is what makes `permissive` more than a slogan: turn it on in production, watch for `missing` and
`invalid`, find the caller nobody remembered, then flip to `enforced`.

## Local development is an issuer row, not a bypass

```jsonc
"auth": {
    "mode": "enforced",
    "trustedIssuers": [{
        "name": "dev-local",
        "issuer": "dev",
        "audience": "qr-manager-api",
        "subjectKind": "service",
        "key": { "source": "value", "algorithm": "HS256", "value": "local-dev-secret" }
    }]
}
```

`mode: enforced` locally, against an inline HS256 secret. The code exercised on a laptop is the code
that runs in production, and 401/403 stop being the only paths never covered. It also fails closed: a
leftover dev issuer row needs the dev secret to exploit, where a leftover `enabled: false` *is* the
vulnerability.

## The barrel is owned by this package

`src/index.ts` is written complete, with the exports of unbuilt units listed and commented out in the
order they land. A barrel only re-exports, so several units appending to it in parallel is several
conflicts on one file. A later unit uncomments its line; it does not decide where to put it.

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
