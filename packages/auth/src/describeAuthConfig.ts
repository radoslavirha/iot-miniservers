import { AuthMode } from './AuthMode.js';
import type { AuthConfig, TrustedIssuer } from './schemas/auth.schema.js';

/**
 * The boot-time summary of what this service will accept.
 *
 * It exists for two reasons, and the second is the one that pays for it daily:
 *
 * 1. A fail-open default becomes an observable one. `disabled` is otherwise
 *    indistinguishable from "correctly configured" — a values file that forgot
 *    the block produces a running, healthy, unauthenticated API with no signal
 *    anywhere.
 * 2. It is the answer to "why is my token rejected" nine times in ten. The
 *    issuer string and audience have to match *exactly*, and seeing both
 *    printed next to the token's own claims ends the guessing.
 *
 * Returned as data rather than logged here, so the caller uses its own logger
 * and this package keeps no logging dependency. Log it at **WARN** unless the
 * mode is `enforced`, which is the only state that warrants `INFO`.
 */
export const describeAuthConfig = (config: AuthConfig): AuthConfigSummary => ({
    mode: config.mode,
    // `enforced` is the destination; anything else is a state worth noticing.
    level: config.mode === AuthMode.Enforced ? 'info' : 'warn',
    message: summaryLine(config),
    issuers: config.trustedIssuers.map(describeIssuer),
    anonymousRoutes: [...config.anonymousRoutes]
});

export interface AuthConfigSummary {
    readonly mode: AuthMode;
    /** Severity the caller should log at. */
    readonly level: 'info' | 'warn';
    /** One human-readable line, safe to log as-is. */
    readonly message: string;
    readonly issuers: readonly IssuerSummary[];
    readonly anonymousRoutes: readonly string[];
}

export interface IssuerSummary {
    readonly name: string;
    readonly issuer: string;
    readonly audience: string;
    readonly subjectKind: string;
    /** Where keys come from, and how they are reached. Never the key itself. */
    readonly keySource: string;
    readonly algorithms: readonly string[];
}

const summaryLine = (config: AuthConfig): string => {
    if (config.mode === AuthMode.Disabled) {
        return 'auth mode=disabled — no credential is read and every request is anonymous.';
    }

    const names = config.trustedIssuers.map(row => `${row.name} (${row.issuer} → aud ${row.audience})`);
    const verb = config.mode === AuthMode.Enforced ? 'rejects' : 'records but does not reject';

    return `auth mode=${config.mode} — ${verb} unverified requests; trusting ${names.join(', ')}.`;
};

const describeIssuer = (row: TrustedIssuer): IssuerSummary => ({
    name: row.name,
    issuer: row.issuer,
    audience: row.audience,
    subjectKind: row.subjectKind,
    // A static row's secret must never reach a log line. The algorithm and the
    // fact that it is inline are the useful parts; the value is the whole
    // credential.
    keySource: row.key.source === 'value'
        ? `inline ${row.key.algorithm} key`
        : `jwks ${row.key.uri}${row.key.auth === 'serviceAccountToken' ? ' (serviceaccount-authenticated)' : ''}`,
    algorithms: row.key.source === 'value' ? [row.key.algorithm] : [...row.key.algorithms]
});
