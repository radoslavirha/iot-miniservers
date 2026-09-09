import { importSPKI } from 'jose';
import { UnresolvableKeyError } from '../IKeySource.js';
import type { IKeySource, KeyLookup, VerificationKey } from '../IKeySource.js';
import type { StaticKey, TrustedIssuer } from '../schemas/auth.schema.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Serves keys carried inline in the configuration.
 *
 * No network, no cache, no expiry — which is exactly why it exists. It lets the
 * JWT verifier be built and exercised end to end with nothing running, and it
 * makes `config/localhost.json` a real enforced issuer row rather than a bypass.
 *
 * Symmetric algorithms (`HS*`) take the secret's bytes directly. Anything else
 * is a PEM-encoded **public** key: the verifier never needs a private key, and
 * accepting one here would invite somebody to paste a signing key into a config
 * file.
 */
export class StaticKeySource implements IKeySource {
    /** Rows that carry an inline key, indexed by exact `iss`. */
    readonly #byIssuer: ReadonlyMap<string, StaticKey>;

    /** Imported keys, so a PEM is parsed once rather than per request. */
    readonly #imported = new Map<string, VerificationKey>();

    /**
     * Takes the whole issuer list and keeps the inline-key rows, so a
     * configuration mixing static and JWKS issuers can be handed to both sources
     * without the caller partitioning it.
     */
    constructor(issuers: readonly TrustedIssuer[]) {
        this.#byIssuer = new Map(
            issuers
                .filter((row): row is TrustedIssuer & { key: StaticKey } => row.key.source === 'value')
                .map(row => [row.issuer, row.key])
        );
    }

    /** True when this source has a key for `issuer` — lets a router pick a source without a throw. */
    handles(issuer: string): boolean {
        return this.#byIssuer.has(issuer);
    }

    async getKey({ issuer, algorithm }: KeyLookup): Promise<VerificationKey> {
        const key = this.#byIssuer.get(issuer);
        if (!key) {
            throw new UnknownStaticIssuerError(issuer);
        }

        // The configured algorithm is the allowlist. Checking it here as well as
        // in the verifier is deliberate: a key source that hands back an HMAC
        // secret for an `RS256` header has already lost, whatever the caller
        // does next.
        if (CommonUtils.notUndefined(algorithm) && algorithm !== key.algorithm) {
            throw new StaticAlgorithmMismatchError(issuer, key.algorithm, algorithm);
        }

        // `kid` is ignored on purpose. A static row holds exactly one key, so
        // there is nothing to select between, and a token carrying an unexpected
        // `kid` still fails on the signature.
        return this.#import(issuer, key);
    }

    async #import(issuer: string, key: StaticKey): Promise<VerificationKey> {
        const cached = this.#imported.get(issuer);
        if (cached) {
            return cached;
        }

        const imported = key.algorithm.startsWith('HS')
            ? new TextEncoder().encode(key.value)
            : await importSPKI(key.value, key.algorithm);

        this.#imported.set(issuer, imported);
        return imported;
    }
}

/**
 * No inline key is configured for this issuer.
 *
 * `UnresolvableKeyError`, because this source is local: there is no fetch to
 * fail, so a miss can only ever mean the credential asked for something that
 * does not exist.
 */
export class UnknownStaticIssuerError extends UnresolvableKeyError {
    constructor(readonly issuer: string) {
        super(`No static key configured for issuer ${issuer}.`);
        this.name = 'UnknownStaticIssuerError';
    }
}

/**
 * The token asked for an algorithm this issuer's key is not for.
 *
 * This is the algorithm-confusion attack arriving — a token signed HS256 with
 * an RSA public key as the secret, against a row configured for RS256. It is
 * emphatically the credential's fault, so it must surface as `invalid`.
 */
export class StaticAlgorithmMismatchError extends UnresolvableKeyError {
    constructor(
        readonly issuer: string,
        readonly expected: string,
        readonly received: string
    ) {
        super(`Issuer ${issuer} is configured for ${expected}, token used ${received}.`);
        this.name = 'StaticAlgorithmMismatchError';
    }
}
