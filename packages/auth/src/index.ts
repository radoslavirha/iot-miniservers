/**
 * Public surface of `@radoslavirha/auth`.
 *
 * **Written complete by P1.0 and touched by nobody else.** A barrel only
 * re-exports, so several units appending their own line to it in parallel is
 * several conflicts on one file. The exports for units that have not been built
 * yet are listed below, commented out, in the order they will land — a later
 * unit uncomments its line rather than deciding where to put it.
 *
 * P1.0 ships contracts only. There is no implementation in this package yet:
 * everything exported here is a type, a schema, or a test double.
 */

// ─── Contracts ────────────────────────────────────────────────────────────────

export { AuthMode } from './AuthMode.js';
export { VerificationReason } from './VerificationOutcome.js';

export type { Principal, PrincipalKind } from './Principal.js';
export type { VerificationOutcome } from './VerificationOutcome.js';
export type { Credential, ITokenVerifier } from './ITokenVerifier.js';
export type { IKeySource, KeyLookup, VerificationKey } from './IKeySource.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export {
    AuthConfigSchema,
    JwksKeySchema,
    KeySchema,
    StaticKeySchema,
    TrustedIssuerSchema
} from './schemas/auth.schema.js';

export type {
    AuthConfig,
    AuthConfigInput,
    JwksKey,
    KeyConfig,
    StaticKey,
    TrustedIssuer
} from './schemas/auth.schema.js';

// ─── Test kit ─────────────────────────────────────────────────────────────────

export { mintTestToken, TEST_SECRET, testSecretBytes } from './test/mintTestToken.js';
export { FakeTokenVerifier, failureOutcome, successOutcome } from './test/FakeTokenVerifier.js';

export type { MintTestTokenOptions } from './test/mintTestToken.js';

// ─── Verification ─────────────────────────────────────────────────────────────

export { JwtVerifier } from './verifiers/JwtVerifier.js';
export {
    StaticAlgorithmMismatchError,
    StaticKeySource,
    UnknownStaticIssuerError
} from './keys/StaticKeySource.js';

// ─── Planned — uncomment as each unit lands ──────────────────────────────────

// P1.2 — remote JWKS, cached by kid, with a bounded fetch
// export { RemoteJwksSource } from './keys/RemoteJwksSource.js';
