import { readFile } from 'node:fs/promises';
import { createRemoteJWKSet, customFetch, errors } from 'jose';
import type { FetchImplementation, RemoteJWKSet } from 'jose';
import { UnresolvableKeyError } from '../IKeySource.js';
import type { IKeySource, KeyLookup, VerificationKey } from '../IKeySource.js';
import type { JwksKey, TrustedIssuer } from '../schemas/auth.schema.js';

/**
 * Where the kubelet projects a pod's ServiceAccount token. Same path
 * `KubernetesServiceAccountStrategy` reads on the outbound side.
 */
export const SERVICE_ACCOUNT_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

/**
 * Serves keys fetched from a remote JWKS endpoint.
 *
 * Built on `jose`'s `createRemoteJWKSet`, which already does the three things
 * that matter and are easy to get wrong: it selects by `kid` *and* `alg`, it
 * refuses to refetch more often than the cooldown allows, and it aborts on a
 * timeout. Reimplementing that would be a cache with a subtle bug in it.
 *
 * Kubernetes is not a special case here either. The apiserver's JWKS needs a
 * bearer token where the IdP's does not, so `auth: 'serviceAccountToken'` on a
 * row adds one header — configuration, not a second code path.
 */
export class RemoteJwksSource implements IKeySource {
    readonly #byIssuer: ReadonlyMap<string, RemoteJWKSet>;
    readonly #configured: ReadonlySet<string>;

    constructor(issuers: readonly TrustedIssuer[], options: RemoteJwksSourceOptions = {}) {
        const rows = issuers.filter(
            (row): row is TrustedIssuer & { key: JwksKey } => row.key.source === 'jwks'
        );

        this.#configured = new Set(rows.map(row => row.issuer));
        this.#byIssuer = new Map(rows.map(row => [row.issuer, this.#resolverFor(row.key, options)]));
    }

    /** True when this source is configured for `issuer` — lets a router pick a source without a throw. */
    handles(issuer: string): boolean {
        return this.#configured.has(issuer);
    }

    async getKey({ issuer, kid, algorithm }: KeyLookup): Promise<VerificationKey> {
        const resolve = this.#byIssuer.get(issuer);
        if (!resolve) {
            throw new UnresolvableKeyError(`No JWKS configured for issuer ${issuer}.`);
        }

        try {
            // `jose` selects on the protected header, so a synthetic one carrying
            // just `alg` and `kid` is all its matcher needs.
            return await resolve({ alg: algorithm, kid });
        } catch (error) {
            // A key set that answered and simply has no such key is the token's
            // fault. A key set that could not be reached is not — and the two
            // must not collapse, or an IdP outage reads as a wave of forgeries.
            if (
                error instanceof errors.JWKSNoMatchingKey ||
                error instanceof errors.JWKSMultipleMatchingKeys
            ) {
                throw new UnresolvableKeyError(error.message);
            }
            throw error;
        }
    }

    #resolverFor(key: JwksKey, options: RemoteJwksSourceOptions): RemoteJWKSet {
        const fetchImpl = options.fetch ?? (key.auth === 'serviceAccountToken'
            ? serviceAccountFetch(options.readServiceAccountToken ?? readProjectedToken)
            : undefined);

        return createRemoteJWKSet(new URL(key.uri), {
            // The whole reason this is required rather than optional: a JWKS
            // endpoint that never answers turns every request into a hang, which
            // is worse than a refusal — it exhausts the connection pool and takes
            // down routes that need no authentication at all.
            timeoutDuration: key.timeoutMs,
            // An unknown `kid` must not become a fetch per request; that is how a
            // bad token turns into a denial of service against the IdP.
            cooldownDuration: key.refreshCooldownMs,
            cacheMaxAge: key.cacheTtlSeconds * 1000,
            ...(fetchImpl ? { [customFetch]: fetchImpl } : {})
        });
    }
}

export interface RemoteJwksSourceOptions {
    /**
     * Replaces the HTTP call entirely. Present so tests can serve a JWKS without
     * a network, and so an operator could route through a proxy.
     */
    readonly fetch?: FetchImplementation;
    /**
     * Reads the ServiceAccount token. Overridable for tests; in a pod the
     * default reads the projected file.
     */
    readonly readServiceAccountToken?: () => Promise<string>;
}

/**
 * Reads the projected ServiceAccount token, **per fetch, never cached**.
 *
 * The kubelet rewrites this file at roughly 80% of the token's lifetime. A
 * token read once at construction would therefore work for about an hour and
 * then fail in a way that looks like a permissions problem, long after the
 * deploy that could be blamed for it.
 */
const readProjectedToken = async (): Promise<string> =>
    (await readFile(SERVICE_ACCOUNT_TOKEN_PATH, 'utf8')).trim();

const serviceAccountFetch = (readToken: () => Promise<string>): FetchImplementation =>
    async (url, options) => {
        const headers = new Headers(options.headers);
        headers.set('Authorization', `Bearer ${await readToken()}`);
        return fetch(url, { ...options, headers });
    };
