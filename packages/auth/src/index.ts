/**
 * Public surface of `@radoslavirha/auth`.
 *
 * **Written complete by P1.0 and touched by nobody else.** A barrel only
 * re-exports, so several units appending their own line to it in parallel is
 * several conflicts on one file. The exports for units that have not been built
 * yet are listed below in the order they will land, so a later unit adds its
 * line rather than deciding where to put it.
 */

// ─── Contracts ────────────────────────────────────────────────────────────────

export { VerifierType } from './VerifierType.js';
export { VerificationReason } from './VerificationOutcome.js';

export type { Principal, PrincipalKind } from './Principal.js';
export type { VerificationOutcome } from './VerificationOutcome.js';
export type { Credential, ITokenVerifier } from './ITokenVerifier.js';
export { UnresolvableKeyError } from './IKeySource.js';
export type { IKeySource, KeyLookup, VerificationKey } from './IKeySource.js';

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export { Authenticator, AuthConfigurationError, buildVerifiers, statusForReason } from './Authenticator.js';
export { describeAuthConfig } from './describeAuthConfig.js';

export type { AuthDecision, AuthVerifiers } from './Authenticator.js';
export type { AuthConfigSummary, IssuerSummary } from './describeAuthConfig.js';

// ─── Observability ────────────────────────────────────────────────────────────

export {
    ATTR_AUTH_ISSUER,
    ATTR_AUTH_OUTCOME,
    AUTH_METER_NAME,
    METRIC_AUTH_VERIFICATIONS,
    recordVerification
} from './authTelemetry.js';

// ─── Configuration ────────────────────────────────────────────────────────────

export {
    AuthConfigSchema,
    createAuthConfigSchema,
    JwksKeySchema,
    JwtVerifierSchema,
    KeySchema,
    StaticKeySchema,
    TrustedIssuerSchema,
    VerifierSchema
} from './schemas/auth.schema.js';

export type {
    AuthConfig,
    AuthConfigInput,
    JwksKey,
    JwtVerifierConfig,
    KeyConfig,
    StaticKey,
    TrustedIssuer,
    VerifierConfig
} from './schemas/auth.schema.js';

// ─── Test kit ─────────────────────────────────────────────────────────────────

export { mintTestToken, TEST_SECRET, testSecretBytes } from './test/mintTestToken.js';
export { FakeTokenVerifier, TEST_METHOD, failureOutcome, successOutcome, verifiersFor } from './test/FakeTokenVerifier.js';

export type { MintTestTokenOptions } from './test/mintTestToken.js';

// ─── Verification ─────────────────────────────────────────────────────────────

export { JwtVerifier } from './verifiers/JwtVerifier.js';
export {
    StaticAlgorithmMismatchError,
    StaticKeySource,
    UnknownStaticIssuerError
} from './keys/StaticKeySource.js';
export { RemoteJwksSource, SERVICE_ACCOUNT_TOKEN_PATH } from './keys/RemoteJwksSource.js';
export { createKeySource } from './keys/createKeySource.js';

export type { RemoteJwksSourceOptions } from './keys/RemoteJwksSource.js';
