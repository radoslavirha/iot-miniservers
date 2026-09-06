import { z } from 'zod';
import { AuthMode } from '../AuthMode.js';

/**
 * An inline key, carried in the configuration itself.
 *
 * This is what makes `config/localhost.json` an *issuer row* rather than a
 * bypass flag: local development runs `mode: enforced` against an HS256 secret,
 * so the code exercised locally is the code that runs in production and the 401
 * and 403 paths stop being the only ones never covered. The outbound half
 * already exists — `JwtSelfSignedStrategy` in `http-provider` signs with the
 * same `{ source: 'value' }` shape — so the two halves meet in a real signed
 * round trip on a laptop.
 *
 * It fails closed in a way `enabled: false` does not: a leftover dev issuer row
 * is exploitable only by someone who also holds the dev secret, where a
 * leftover disable flag *is* the whole vulnerability.
 */
export const StaticKeySchema = z.object({
    source: z.literal('value'),
    /**
     * Algorithm this key is for, and the only one accepted from this issuer.
     *
     * Singular and required, because it is also the allowlist. Trusting the
     * algorithm named in the JWS header is the classic JWT failure — `alg:
     * none`, or an RSA public key accepted as an HMAC secret.
     */
    algorithm: z.string().min(1).default('HS256'),
    /** `HS*`: the shared secret. Otherwise: a PEM-encoded public key. */
    value: z.string().min(1)
});

/**
 * Keys fetched from a remote JWKS endpoint. Consumed by P1.2; the shape is
 * fixed here so a config file written today does not have to change.
 */
export const JwksKeySchema = z.object({
    source: z.literal('jwks'),
    uri: z.url(),
    /**
     * Whether the JWKS fetch itself needs a credential.
     *
     * This single field is the whole of the Kubernetes special case: the
     * apiserver's JWKS is not anonymously readable, the IdP's is. Configuration,
     * not a branch in the verifier — which is what lets the same binary run
     * outside a cluster.
     */
    auth: z.enum(['none', 'serviceAccountToken']).default('none'),
    /** Signature algorithms accepted from this issuer. An allowlist, always. */
    algorithms: z.array(z.string().min(1)).default(['RS256']),
    /** How long a fetched key set is reused, so the IdP is not on every request's path. */
    cacheTtlSeconds: z.number().int().positive().default(300),
    /**
     * Floor on how often a key set may be refetched, independent of the cache
     * age above.
     *
     * The cache says when a key set is stale; this says how fast a *miss* may
     * force a refetch. Without it, a stream of tokens carrying an unknown `kid`
     * becomes a fetch per request — a bad token turned into a denial of service
     * against the IdP.
     */
    refreshCooldownMs: z.number().int().positive().default(30_000),
    /**
     * Hard ceiling on the fetch. Required, because the failure mode is the
     * point: a JWKS endpoint that never answers turns every request into a hang
     * rather than a refusal, exhausting the connection pool and taking down
     * routes that need no authentication at all.
     */
    timeoutMs: z.number().int().positive().default(3000)
});

export const KeySchema = z.discriminatedUnion('source', [StaticKeySchema, JwksKeySchema]);

/**
 * One trust source: an issuer we are willing to believe, and the terms.
 *
 * Kubernetes is a row here, not a code path. Add a cluster, swap IdPs, or run
 * with no Kubernetes at all — each is a configuration change.
 */
export const TrustedIssuerSchema = z.object({
    /**
     * Operator-facing label. Not matched against anything — it exists so the
     * boot-time log can name each trusted issuer, which is the answer to "why
     * is my token rejected" nine times in ten.
     */
    name: z.string().min(1),
    /**
     * Exact `iss` value to match, compared as a string.
     *
     * Never normalised, and in particular the trailing slash is never stripped:
     * Authentik's per-provider issuers carry one and `iss` comparison is exact.
     * A helpful normalisation here would silently accept a token from a
     * different issuer.
     */
    issuer: z.string().min(1),
    /**
     * Audience this service answers to. A token minted for another service must
     * be refused even though its signature is perfectly valid — that refusal is
     * the only thing standing between "a token" and "a token for us".
     */
    audience: z.string().min(1),
    key: KeySchema,
    /**
     * Which caller class tokens from this issuer represent. Stamped onto the
     * `Principal`; a property of the trust source, not of the token.
     */
    subjectKind: z.enum(['human', 'service', 'device']).default('human'),
    /**
     * Claim to read roles from. Authentik puts them in `roles`; the Kubernetes
     * apiserver has no equivalent, so a source with no such claim yields an
     * empty list rather than an error.
     */
    rolesClaim: z.string().default('roles')
});

/**
 * The `auth` block of a service's configuration.
 *
 * Every field carries a default, per the repo's configuration contract, so a
 * service that says nothing gets `disabled` and behaves exactly as it does
 * today. Turning authentication on is an explicit act.
 */
export const AuthConfigSchema = z.object({
    mode: z.enum([AuthMode.Disabled, AuthMode.Permissive, AuthMode.Enforced]).default(AuthMode.Disabled),
    /**
     * Trust sources, in no particular order — a token is matched to one by its
     * `iss`, never by position.
     *
     * Defaults to empty, which is only coherent in `disabled`. `enforced` with
     * no issuers can verify nothing and should fail at boot rather than refuse
     * every request at runtime; that check is P1.3's, because it is a startup
     * concern rather than a shape concern.
     */
    trustedIssuers: z.array(TrustedIssuerSchema).default([]),
    /**
     * Routes that stay open, as an explicit allowlist.
     *
     * An allowlist rather than a denylist because the next catch-all route is
     * one decorator away, and a denylist fails open when somebody forgets.
     */
    anonymousRoutes: z.array(z.string().min(1)).default([])
});

/** Config as **authored** — every defaulted field may be omitted. */
export type AuthConfigInput = z.input<typeof AuthConfigSchema>;

/** Config as **parsed** — every default resolved. What the runtime works with. */
export type AuthConfig = z.output<typeof AuthConfigSchema>;

export type StaticKey = z.output<typeof StaticKeySchema>;
export type JwksKey = z.output<typeof JwksKeySchema>;
export type KeyConfig = z.output<typeof KeySchema>;
export type TrustedIssuer = z.output<typeof TrustedIssuerSchema>;
