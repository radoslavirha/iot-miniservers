import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCallback } from './handleCallback.js';
import type { AuthClient } from './createAuthClient.js';

const client = (overrides: Record<string, unknown> = {}) =>
    ({
        signinRedirectCallback: vi.fn().mockResolvedValue({}),
        ...overrides
    } as unknown as AuthClient);

const at = (search: string) => window.history.replaceState(null, '', `/callback${search}`);

afterEach(() => window.history.replaceState(null, '', '/'));

describe('handleCallback', () => {
    it('completes a login', async () => {
        at('?code=abc&state=xyz');
        const c = client();

        await expect(handleCallback(c)).resolves.toBe('signed-in');
        expect(c.signinRedirectCallback).toHaveBeenCalledOnce();
    });

    it('reports no-session for login_required, without attempting an exchange', async () => {
        // The prompt=none attempt made on load. Not an error: it is the IdP
        // saying nobody is signed in, and the caller renders a sign-in page.
        at('?error=login_required&state=xyz');
        const c = client();

        await expect(handleCallback(c)).resolves.toBe('no-session');
        expect(c.signinRedirectCallback).not.toHaveBeenCalled();
    });

    it.each(['consent_required', 'interaction_required'])(
        'treats %s as no-session too — all three mean "interaction needed"',
        async error => {
            at(`?error=${error}&state=xyz`);
            await expect(handleCallback(client())).resolves.toBe('no-session');
        }
    );

    it('reports failure rather than throwing into the router', async () => {
        at('?code=abc&state=xyz');
        const c = client({ signinRedirectCallback: vi.fn().mockRejectedValue(new Error('invalid_grant')) });

        await expect(handleCallback(c)).resolves.toBe('failed');
    });
});
