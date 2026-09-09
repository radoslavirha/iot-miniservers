import { describe, expect, it } from 'vitest';
import type { Principal } from '@radoslavirha/auth';
import type { PlatformContext } from '@tsed/platform-http';
import { PRINCIPAL_CONTEXT_KEY } from './AuthGuard.js';
import { PrincipalPipe } from './PrincipalPipe.js';

const contextHolding = (principal?: Principal) => {
    const values = new Map<string, unknown>();
    if (principal !== undefined) {
        values.set(PRINCIPAL_CONTEXT_KEY, principal);
    }
    return { get: <T>(key: string) => values.get(key) as T } as unknown as PlatformContext;
};

const principal: Principal = {
    subject: 'radoslav',
    kind: 'human',
    roles: ['qr-manager.admin'],
    issuer: 'https://idp.test/'
};

describe('PrincipalPipe', () => {
    it('returns whatever the guard parked on the context', () => {
        expect(new PrincipalPipe().transform(contextHolding(principal))).toEqual(principal);
    });

    it('returns undefined when nobody was verified, rather than a stand-in', () => {
        // `disabled`, or `permissive` with no credential. A fabricated subject
        // in an audit column is worse than an empty one.
        expect(new PrincipalPipe().transform(contextHolding())).toBeUndefined();
    });
});
