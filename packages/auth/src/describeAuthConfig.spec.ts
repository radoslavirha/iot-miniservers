import { describe, expect, it } from 'vitest';
import { describeAuthConfig } from './describeAuthConfig.js';
import { AuthConfigSchema } from './schemas/auth.schema.js';

const parse = (input: unknown) => AuthConfigSchema.parse(input);

const staticIssuer = {
    name: 'dev-local',
    issuer: 'dev',
    audience: 'qr-manager-api',
    subjectKind: 'service',
    key: { source: 'value', algorithm: 'HS256', value: 'local-dev-secret' }
};

const jwksIssuer = {
    name: 'idp',
    issuer: 'https://auth.irha.cz/application/o/app/',
    audience: 'app',
    key: { source: 'jwks', uri: 'https://auth.irha.cz/application/o/app/jwks/' }
};

describe('describeAuthConfig', () => {
    it('warns when nothing is being verified, because that state is otherwise invisible', () => {
        const summary = describeAuthConfig(parse({}));

        expect(summary.level).toBe('warn');
        expect(summary.message).toContain('disabled');
        expect(summary.message).toContain('every request is anonymous');
    });

    it('warns in permissive, which is a waypoint and not a destination', () => {
        const summary = describeAuthConfig(parse({ mode: 'permissive', trustedIssuers: [staticIssuer] }));

        expect(summary.level).toBe('warn');
        expect(summary.message).toContain('records but does not reject');
    });

    it('is informational only once enforcing', () => {
        const summary = describeAuthConfig(parse({ mode: 'enforced', trustedIssuers: [staticIssuer] }));

        expect(summary.level).toBe('info');
        expect(summary.message).toContain('rejects');
    });

    it('names the issuer and audience, which is the answer to "why is my token rejected"', () => {
        const summary = describeAuthConfig(parse({ mode: 'enforced', trustedIssuers: [jwksIssuer] }));

        expect(summary.message).toContain('https://auth.irha.cz/application/o/app/');
        expect(summary.message).toContain('aud app');
        expect(summary.issuers[0]).toMatchObject({
            name: 'idp',
            issuer: 'https://auth.irha.cz/application/o/app/',
            audience: 'app',
            algorithms: ['RS256']
        });
    });

    it('describes where keys come from without ever printing one', () => {
        const summary = describeAuthConfig(parse({ mode: 'enforced', trustedIssuers: [staticIssuer] }));

        expect(summary.issuers[0]?.keySource).toBe('inline HS256 key');
        // The secret is the whole credential. It must not reach a log line.
        expect(JSON.stringify(summary)).not.toContain('local-dev-secret');
    });

    it('marks a serviceaccount-authenticated JWKS, so the Kubernetes case is visible', () => {
        const summary = describeAuthConfig(parse({
            mode: 'enforced',
            trustedIssuers: [{ ...jwksIssuer, key: { ...jwksIssuer.key, auth: 'serviceAccountToken' } }]
        }));

        expect(summary.issuers[0]?.keySource).toContain('serviceaccount-authenticated');
    });

    it('reports the anonymous allowlist, since those routes bypass everything', () => {
        const summary = describeAuthConfig(parse({
            mode: 'enforced',
            trustedIssuers: [staticIssuer],
            anonymousRoutes: ['/health', '/r/:slug']
        }));

        expect(summary.anonymousRoutes).toEqual(['/health', '/r/:slug']);
    });

    it('lists every trusted issuer when there are several', () => {
        const summary = describeAuthConfig(parse({
            mode: 'enforced',
            trustedIssuers: [staticIssuer, jwksIssuer]
        }));

        expect(summary.issuers).toHaveLength(2);
        expect(summary.message).toContain('dev-local');
        expect(summary.message).toContain('idp');
    });
});
