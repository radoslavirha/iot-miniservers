import { decodeJwt, decodeProtectedHeader, errors, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';
import { UnresolvableKeyError } from '../IKeySource.js';
import type { IKeySource } from '../IKeySource.js';
import type { CredentialSource } from '../CredentialSource.js';
import type { Credential, ITokenVerifier } from '../ITokenVerifier.js';
import type { Principal } from '../Principal.js';
import type { TrustedIssuer } from '../schemas/auth.schema.js';
import { VerificationReason, type VerificationOutcome } from '../VerificationOutcome.js';
import { ArrayUtils, CommonUtils, StringUtils } from '@radoslavirha/utils';

/**
 * Verifies a JWT against the configured trust sources.
 *
 * The only verifier this repo needs today, and the one every caller class flows
 * through: a human's IdP token and a Kubernetes ServiceAccount token are the
 * same RS256 JWT verified by the same code, differing only in which issuer row
 * matched.
 *
 * It owns no keys. Where a key comes from — inline config or a remote JWKS — is
 * the `IKeySource`'s problem, which is what lets this class be written and
 * tested with no infrastructure and have JWKS swapped in behind it later.
 */
export class JwtVerifier implements ITokenVerifier {
    readonly #byIssuer: ReadonlyMap<string, TrustedIssuer>;
    readonly #keys: IKeySource;

    constructor(issuers: readonly TrustedIssuer[], keys: IKeySource) {
        this.#byIssuer = new Map(issuers.map(row => [row.issuer, row]));
        this.#keys = keys;
    }

    /**
     * `Authorization: Bearer <token>`, and nothing else.
     *
     * This used to live in the Ts.ED guard, where it made every route
     * bearer-shaped whatever verifier it named. It belongs here: the mechanism
     * knows how its credential travels.
     *
     * Anything that is not a bearer scheme returns `undefined` rather than the
     * raw header, so `Basic …` reads as "no credential for me" instead of
     * reaching the JWT parser as garbage and being counted as `invalid`. On a
     * route admitting several methods that distinction is what lets the right
     * verifier answer.
     *
     * The scheme is matched case-insensitively: RFC 7235 says it is, and clients
     * do send `bearer`.
     */
    extract(source: CredentialSource): Credential | undefined {
        const header = source.header('authorization');
        if (!StringUtils.isNotEmpty(header)) {
            return undefined;
        }

        const [scheme, ...rest] = header.trim().split(/\s+/);
        if (scheme?.toLowerCase() !== 'bearer' || rest.length === 0) {
            return undefined;
        }

        return rest.join(' ');
    }

    async verify(credential: Credential): Promise<VerificationOutcome> {
        // An absent or blank credential is `missing`, not `invalid`. P1.3 counts
        // these separately, and the difference is what tells "a caller nobody
        // remembered" apart from "a caller sending rubbish".
        if (credential.trim() === '') {
            return { reason: VerificationReason.Missing };
        }

        // Read `iss` before verifying anything, purely to select a trust source.
        // Nothing read here is trusted — the signature check below is what makes
        // any of it meaningful.
        let issuer: string | undefined;
        let algorithm: string | undefined;
        let kid: string | undefined;
        try {
            issuer = decodeJwt(credential).iss;
            ({ alg: algorithm, kid } = decodeProtectedHeader(credential));
        } catch (error) {
            return invalid(error);
        }

        if (CommonUtils.isUndefined(issuer)) {
            return { reason: VerificationReason.Invalid, detail: 'token carries no iss claim' };
        }

        const row = this.#byIssuer.get(issuer);
        if (!row) {
            return { reason: VerificationReason.UnknownIssuer, detail: `no trusted issuer matches ${issuer}` };
        }

        // Two very different failures hide behind one `await`.
        //
        // `UnresolvableKeyError` means the token asked for a key that will never
        // exist — an unknown `kid`, or an algorithm the configured key is not
        // for. That is the credential's fault and must read as `invalid`;
        // reporting it as `indeterminate` files an algorithm-confusion attack
        // under "the IdP might be down".
        //
        // Anything else means the source could not be consulted at all. An
        // unreachable JWKS says nothing about the token, so counting it as a bad
        // one would make an outage look like an attack and `enforced` mode
        // indistinguishable from a broken dependency.
        let key;
        try {
            key = await this.#keys.getKey({ issuer, kid, algorithm });
        } catch (error) {
            return error instanceof UnresolvableKeyError
                ? invalid(error)
                : { reason: VerificationReason.Indeterminate, detail: messageOf(error) };
        }

        try {
            const { payload } = await jwtVerify(credential, key, {
                issuer: row.issuer,
                audience: row.audience,
                // The allowlist, never the header's own claim about itself.
                algorithms: algorithmsFor(row)
            });
            // No `sub`, no principal. Falling back to a placeholder would put a
            // fabricated subject in an audit column, which is worse than an
            // empty one because it is indistinguishable from a real subject
            // later.
            if (!StringUtils.isNotEmpty(payload.sub)) {
                return { reason: VerificationReason.Invalid, detail: 'token carries no sub claim' };
            }
            return { reason: VerificationReason.Ok, principal: toPrincipal(payload, payload.sub, row) };
        } catch (error) {
            // `aud` gets its own reason because it is the one failure that means
            // "a real token, minted for somebody else" — a misrouted caller or a
            // confused-deputy attempt, not a forged credential.
            if (error instanceof errors.JWTClaimValidationFailed && error.claim === 'aud') {
                return { reason: VerificationReason.WrongAudience, detail: messageOf(error) };
            }
            return invalid(error);
        }
    }
}

/**
 * Which algorithms this issuer's tokens may be signed with.
 *
 * A static row carries exactly one; a JWKS row carries a list. Either way it
 * comes from configuration and never from the token.
 */
const algorithmsFor = (row: TrustedIssuer): string[] =>
    row.key.source === 'value' ? [row.key.algorithm] : [...row.key.algorithms];

const toPrincipal = (payload: JWTPayload, subject: string, row: TrustedIssuer): Principal => ({
    subject,
    kind: row.subjectKind,
    displayName: StringUtils.isString(payload['preferred_username']) ? payload['preferred_username'] : undefined,
    roles: rolesFrom(payload, row.rolesClaim),
    issuer: row.issuer
});

/**
 * Roles as the issuer stated them.
 *
 * A missing claim is an empty list, not an error: the Kubernetes apiserver has
 * no roles claim at all, and a service token is none the less valid for it.
 * Non-string entries are dropped rather than coerced — `roles: [1, 2]` is a
 * misconfiguration, and `['1', '2']` would hide it.
 */
const rolesFrom = (payload: JWTPayload, claim: string): string[] => {
    const raw = payload[claim];
    return ArrayUtils.isArray(raw) ? raw.filter((entry): entry is string => StringUtils.isString(entry)) : [];
};

const invalid = (error: unknown): VerificationOutcome => ({
    reason: VerificationReason.Invalid,
    detail: messageOf(error)
});

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));
