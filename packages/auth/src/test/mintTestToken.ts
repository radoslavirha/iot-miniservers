import { SignJWT } from 'jose';

/**
 * Signs a JWT for tests.
 *
 * HS256 with an inline secret, deliberately. A symmetric key needs no key pair
 * generation, no fixture files and no network, so P1.1 can make a full signed
 * round trip — mint, verify, assert on the `Principal` — with no infrastructure
 * whatsoever. P1.2 exercises RS256 against a real JWKS; that is its job, not
 * this helper's.
 *
 * It lives in P1.0 because three later units all need to mint a token, and
 * three hand-rolled fixtures would disagree about claim names on the day one of
 * them is wrong.
 *
 * **Test-only.** It is exported from the package root so other packages' tests
 * can use it, which does mean a signing helper ships in the bundle. That is a
 * deliberate trade for a private, in-repo package; anything reachable by it is
 * already reachable by the application code next to it.
 */
export const mintTestToken = async (options: MintTestTokenOptions = {}): Promise<string> => {
    const {
        secret = TEST_SECRET,
        issuer = 'https://issuer.test/',
        audience = 'test-audience',
        subject = 'test-subject',
        // Far enough out that a slow suite cannot expire a token mid-run.
        expiresIn = '1h',
        claims = {}
    } = options;

    return new SignJWT({ ...claims })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setExpirationTime(expiresIn)
        .sign(toKeyBytes(secret));
};

export interface MintTestTokenOptions {
    /** Shared secret to sign with. Defaults to `TEST_SECRET`. */
    readonly secret?: string;
    /** `iss`. Keeps its trailing slash, like a real Authentik issuer. */
    readonly issuer?: string;
    /** `aud`. */
    readonly audience?: string;
    /** `sub`. */
    readonly subject?: string;
    /**
     * `exp`, as a `jose` time span (`'1h'`, `'-5m'`) or an absolute epoch
     * second. A negative span is how a test mints an already-expired token.
     */
    readonly expiresIn?: string | number;
    /** Extra claims — `roles`, `preferred_username`, anything a verifier reads. */
    readonly claims?: Readonly<Record<string, unknown>>;
}

/**
 * Default signing secret. Long enough for HS256, and obviously fake so it can
 * never be mistaken for something that leaked out of a real configuration.
 */
export const TEST_SECRET = 'test-secret-not-a-real-key-000000';

/** The default secret as bytes, for handing to a verifier under test. */
export const testSecretBytes = (secret: string = TEST_SECRET): Uint8Array => toKeyBytes(secret);

const toKeyBytes = (secret: string): Uint8Array => new TextEncoder().encode(secret);
