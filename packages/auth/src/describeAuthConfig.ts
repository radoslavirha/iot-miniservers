import { ObjectUtils } from '@radoslavirha/utils';
import { VerifierType } from './VerifierType.js';
import type { AuthConfig, TrustedIssuer } from './schemas/auth.schema.js';

/**
 * The boot-time summary of what this service will accept.
 *
 * It exists for two reasons, and the second is the one that pays for it daily:
 *
 * 1. A service that ended up with no verifier at all becomes visible. That state
 *    is otherwise silent until the first guarded request answers 500.
 * 2. It is the answer to "why is my token rejected" nine times in ten. The
 *    issuer string and audience have to match *exactly*, and seeing both
 *    printed next to the token's own claims ends the guessing.
 *
 * Returned as data rather than logged here, so the caller uses its own logger
 * and this package keeps no logging dependency.
 */
export const describeAuthConfig = (config: AuthConfig): AuthConfigSummary => {
    const methods = ObjectUtils.keys(config);

    return {
        // Nothing configured is the one state worth raising a voice about: any
        // guarded route will fail, and no request will ever say why.
        level: methods.length === 0 ? 'warn' : 'info',
        message: summaryLine(config, methods),
        methods,
        issuers: issuersOf(config).map(describeIssuer)
    };
};

export interface AuthConfigSummary {
    /** Which named methods this service is configured to accept. */
    readonly methods: readonly string[];
    /** Severity the caller should log at. */
    readonly level: 'info' | 'warn';
    /** One human-readable line, safe to log as-is. */
    readonly message: string;
    readonly issuers: readonly IssuerSummary[];
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

const summaryLine = (config: AuthConfig, methods: readonly string[]): string => {
    if (methods.length === 0) {
        return 'auth — no verifier is configured; any guarded route will fail.';
    }

    const names = issuersOf(config).map(row => `${row.name} (${row.issuer} → aud ${row.audience})`);

    return `auth — accepting ${methods.join(', ')}; trusting ${names.join(', ')}.`;
};

/** Every trusted issuer across every configured verifier that has any. */
const issuersOf = (config: AuthConfig): TrustedIssuer[] =>
    ObjectUtils.values(config).flatMap(entry => (entry?.type === VerifierType.BearerJwt ? entry.trustedIssuers : []));

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
