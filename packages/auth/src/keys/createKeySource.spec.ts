import { describe, expect, it } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';
import type { FetchImplementation } from 'jose';
import { createKeySource } from './createKeySource.js';
import { UnresolvableKeyError } from '../IKeySource.js';
import { JwtVerifier } from '../verifiers/JwtVerifier.js';
import { TrustedIssuerSchema } from '../schemas/auth.schema.js';
import { mintTestToken, TEST_SECRET } from '../test/mintTestToken.js';

const DEV = 'dev';
const IDP = 'https://idp.test/app/';

const devRow = TrustedIssuerSchema.parse({
    name: 'dev-local',
    issuer: DEV,
    audience: 'my-api',
    subjectKind: 'service',
    key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET }
});

const idpRow = TrustedIssuerSchema.parse({
    name: 'idp',
    issuer: IDP,
    audience: 'my-api',
    key: { source: 'jwks', uri: 'https://idp.test/jwks' }
});

describe('createKeySource', () => {
    it('serves an inline row without touching the network', async () => {
        const source = createKeySource([devRow, idpRow], {
            fetch: () => Promise.reject(new Error('the network must not be used here'))
        });

        expect(await source.getKey({ issuer: DEV, algorithm: 'HS256' }))
            .toEqual(new TextEncoder().encode(TEST_SECRET));
    });

    it('serves a jwks row from the remote set', async () => {
        const { publicKey } = await generateKeyPair('RS256', { extractable: true });
        const jwk = { ...(await exportJWK(publicKey)), kid: 'key-1', alg: 'RS256', use: 'sig' };
        const fetchImpl: FetchImplementation = () => Promise.resolve(
            new Response(JSON.stringify({ keys: [jwk] }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        const source = createKeySource([devRow, idpRow], { fetch: fetchImpl });

        expect(await source.getKey({ issuer: IDP, kid: 'key-1', algorithm: 'RS256' }))
            .toHaveProperty('type', 'public');
    });

    it('refuses an issuer no row covers, as the credential’s fault', async () => {
        const source = createKeySource([devRow, idpRow]);

        await expect(source.getKey({ issuer: 'https://nobody.test/' })).rejects.toBeInstanceOf(
            UnresolvableKeyError
        );
    });

    it('routes rather than cascading, so a JWKS outage is not reported as an unknown key', async () => {
        // A cascade would fall through to "no source handled it" and report the
        // credential as invalid, hiding the outage entirely.
        const source = createKeySource([devRow, idpRow], {
            fetch: () => Promise.reject(new Error('ECONNREFUSED'))
        });

        const error = await source.getKey({ issuer: IDP, kid: 'key-1' }).catch((e: unknown) => e);

        expect(error).toBeInstanceOf(Error);
        expect(error).not.toBeInstanceOf(UnresolvableKeyError);
    });

    it('drives a full verification for the inline row it serves', async () => {
        const source = createKeySource([devRow, idpRow], {
            fetch: () => Promise.reject(new Error('unused'))
        });
        const verifier = new JwtVerifier([devRow, idpRow], source);

        const outcome = await verifier.verify(
            await mintTestToken({ issuer: DEV, audience: 'my-api', subject: 'a-service' })
        );

        expect(outcome).toMatchObject({ reason: 'ok' });
        expect(outcome).toHaveProperty('principal.kind', 'service');
    });
});
