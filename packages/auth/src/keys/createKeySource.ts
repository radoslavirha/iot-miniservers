import { UnresolvableKeyError } from '../IKeySource.js';
import type { IKeySource, KeyLookup, VerificationKey } from '../IKeySource.js';
import type { TrustedIssuer } from '../schemas/auth.schema.js';
import { RemoteJwksSource, type RemoteJwksSourceOptions } from './RemoteJwksSource.js';
import { StaticKeySource } from './StaticKeySource.js';

/**
 * Builds the key source for a whole configuration.
 *
 * `JwtVerifier` takes exactly one `IKeySource`, but a real configuration mixes
 * kinds — a `dev-local` inline row next to the IdP's JWKS is the ordinary case
 * on a laptop. This routes each lookup to whichever source is configured for
 * that issuer, so neither source needs to know the other exists and the
 * verifier keeps seeing one seam.
 *
 * Both sources already answer `handles(issuer)`, which is what makes the
 * routing a lookup rather than a try/catch cascade — a cascade would swallow a
 * genuine JWKS timeout as "try the next one" and report it as an unknown key.
 */
export const createKeySource = (
    issuers: readonly TrustedIssuer[],
    options: RemoteJwksSourceOptions = {}
): IKeySource => new CompositeKeySource(issuers, options);

class CompositeKeySource implements IKeySource {
    readonly #static: StaticKeySource;
    readonly #remote: RemoteJwksSource;

    constructor(issuers: readonly TrustedIssuer[], options: RemoteJwksSourceOptions) {
        // Each source filters the list to the rows it serves, so both can be
        // handed the whole configuration.
        this.#static = new StaticKeySource(issuers);
        this.#remote = new RemoteJwksSource(issuers, options);
    }

    async getKey(params: KeyLookup): Promise<VerificationKey> {
        if (this.#static.handles(params.issuer)) {
            return this.#static.getKey(params);
        }
        if (this.#remote.handles(params.issuer)) {
            return this.#remote.getKey(params);
        }

        // Reached only for an issuer with no row at all. `JwtVerifier` normally
        // catches that first and answers `unknown-issuer`; this is the same
        // judgement, so it must stay the credential's fault rather than becoming
        // an `indeterminate` that would read as an outage.
        throw new UnresolvableKeyError(`No key source configured for issuer ${params.issuer}.`);
    }
}
