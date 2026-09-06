import { z } from 'zod';
import { AuthMode } from '../AuthMode.js';

/**
 * How a trust source's verification keys are obtained.
 *
 * A discriminated union with one member today — `jwks`, a remote JWKS endpoint.
 * It is a union rather than a bare object because P1.1 adds inline static keys
 * and later work may add introspection, and a union member is additive where a
 * widened object is a breaking edit to every row already written.
 */
export const JwksKeySourceSchema = z.object({
    kind: z.literal('jwks'),
    /** Absolute URL of the JWKS document. */
    url: z.url(),
    /**
     * How long a fetched key set is reused. A JWKS fetch per request would put
     * the IdP on the critical path of every call.
     */
    cacheTtlSeconds: z.number().int().positive().default(300),
    /**
     * Hard ceiling on the fetch.
     *
     * Required, not optional, and the reason is the failure mode: an
     * unreachable JWKS endpoint that never answers turns every request into a
     * hang rather than a refusal. A hang is worse than a `503` — it exhausts
     * the connection pool and takes down routes that need no authentication at
     * all.
     */
    timeoutMs: z.number().int().positive().default(3000),
    /**
     * Send the pod's ServiceAccount token with the JWKS fetch.
     *
     * This is the whole of the Kubernetes special case: the apiserver's JWKS is
     * not anonymously readable, the IdP's is. Configuration, not a code branch —
     * which is what keeps this package runnable outside a cluster.
     */
    serviceAccountToken: z.boolean().default(false)
});

export const KeySourceSchema = z.discriminatedUnion('kind', [JwksKeySourceSchema]);

/**
 * One trust source: an issuer we are willing to believe, and the terms.
 */
export const TrustedIssuerSchema = z.object({
    /**
     * Exact `iss` value to match, compared as a string.
     *
     * Not normalised, and in particular the trailing slash is never stripped:
     * Authentik's per-provider issuers carry one, and `iss` comparison is exact.
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
    keySource: KeySourceSchema,
    /**
     * Which caller class tokens from this issuer represent. Stamped onto the
     * `Principal`; it is a property of the trust source, not of the token.
     */
    principalKind: z.enum(['human', 'service', 'device']).default('human'),
    /**
     * Claim to read roles from. Authentik puts them in `roles`; the Kubernetes
     * apiserver has no equivalent, so a source with no roles claim yields an
     * empty list rather than an error.
     */
    rolesClaim: z.string().default('roles'),
    /**
     * Signature algorithms accepted from this issuer.
     *
     * An allowlist, always. Trusting whatever the JWS header names is the
     * classic JWT failure — `alg: none`, or an RSA public key accepted as an
     * HMAC secret.
     */
    algorithms: z.array(z.string().min(1)).default(['RS256'])
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
     * Defaults to empty, which is coherent only in `disabled`. `enforced` with
     * no issuers can verify nothing and must fail at boot rather than refuse
     * every request at runtime; that check is P1.3's, because it is a startup
     * concern rather than a shape concern.
     */
    issuers: z.array(TrustedIssuerSchema).default([]),
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

export type JwksKeySource = z.output<typeof JwksKeySourceSchema>;
export type KeySourceConfig = z.output<typeof KeySourceSchema>;
export type TrustedIssuer = z.output<typeof TrustedIssuerSchema>;
