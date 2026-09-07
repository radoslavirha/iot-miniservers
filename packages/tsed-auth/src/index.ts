/**
 * Ts.ED wiring for `@radoslavirha/auth`.
 *
 * The core package decides; this one reads a header, throws the right
 * exception, and makes the result injectable. Keeping the split means every
 * outcome is testable without a server.
 */

export { AuthGuard, PRINCIPAL_CONTEXT_KEY, bearerFrom, principalOf } from './AuthGuard.js';
export { AuthenticationService } from './AuthenticationService.js';
export { PrincipalPipe } from './PrincipalPipe.js';
export { Anonymous, Authenticate, CurrentPrincipal } from './decorators.js';
export { authenticateBearerJwt } from './testing/authenticateBearerJwt.js';
export type { AuthenticatableAgent } from './testing/authenticateBearerJwt.js';

export type { AuthGuardOptions } from './AuthGuard.js';

// Re-exported so a service wiring auth needs only this package — where the
// logic lives is an implementation detail, not part of how auth is configured.
export {
    AuthConfigSchema,
    AuthConfigurationError,
    VerificationReason,
    VerifierType,
    createAuthConfigSchema,
    describeAuthConfig
} from '@radoslavirha/auth';
// The test kit too: a service writing 401 integration tests needs to mint a
// token, and should not have to depend on the core package to do it.
export { FakeTokenVerifier, TEST_METHOD, TEST_SECRET, failureOutcome, mintTestToken, successOutcome } from '@radoslavirha/auth';
export type {
    AuthConfig,
    AuthConfigInput,
    AuthConfigSummary,
    Principal,
    PrincipalKind,
    TrustedIssuer
} from '@radoslavirha/auth';
