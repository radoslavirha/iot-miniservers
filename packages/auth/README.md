# @radoslavirha/auth

Framework-agnostic authentication **contracts**: the `Principal` every mechanism resolves to, the
vocabulary for why a credential was accepted or refused, the two seams implementations plug into, the
configuration schema, and the shared test kit.

**This package contains no implementation.** It is the gate the rest of the auth work compiles
against — verifiers, key sources, the mode pipeline and the Ts.ED guard all arrive later and all
depend on the names fixed here. Nothing in it verifies anything.

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

## Three decisions worth knowing

**The outcome strings are load-bearing in three places at once** — metric label values, log vocabulary,
and the HTTP status mapping. They are defined once, here, and used verbatim. Three units inventing
three spellings for the same condition is the failure this prevents.

**`indeterminate` is not `invalid`.** A JWKS fetch is I/O and can fail; the credential may be perfectly
good and we simply cannot say. Collapsing the two would report an outage as a wave of bad tokens and
make `enforced` indistinguishable from a broken IdP.

**Kubernetes is not a special case.** A ServiceAccount token is "an issuer whose JWKS fetch happens to
need a bearer token" — a `serviceAccountToken: true` row in configuration, not a branch in the
verifier. Delete the row and the same binary runs on a VM.

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
