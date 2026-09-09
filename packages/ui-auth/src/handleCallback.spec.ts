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

        await expect(handleCallback(c)).resolves.toMatchObject({ result: 'signed-in' });
        expect(c.signinRedirectCallback).toHaveBeenCalledOnce();
    });

    it('reports no-session for login_required, without attempting an exchange', async () => {
        // The prompt=none attempt made on load. Not an error: it is the IdP
        // saying nobody is signed in, and the caller renders a sign-in page.
        at('?error=login_required&state=xyz');
        const c = client();

        await expect(handleCallback(c)).resolves.toEqual({ result: 'no-session' });
        expect(c.signinRedirectCallback).not.toHaveBeenCalled();
    });

    it.each(['consent_required', 'interaction_required'])(
        'treats %s as no-session too — all three mean "interaction needed"',
        async error => {
            at(`?error=${error}&state=xyz`);
            await expect(handleCallback(client())).resolves.toEqual({ result: 'no-session' });
        }
    );

    it('returns where the user was, so a renewal does not lose their place', async () => {
        // Renewal is a redirect. Without this, every renewal drops whoever was
        // mid-task back on the landing page — roughly twice an hour.
        at('?code=abc&state=xyz');
        const c = client({
            signinRedirectCallback: vi.fn().mockResolvedValue({ state: { returnTo: '/admin/671b?active=true' } })
        });

        await expect(handleCallback(c)).resolves.toEqual({
            result: 'signed-in',
            returnTo: '/admin/671b?active=true'
        });
    });

    it.each(['//evil.test/phish', 'https://evil.test', 'admin', '', 42, undefined, null])(
        'refuses %p as a return path',
        async returnTo => {
            // The value survives a round trip through the IdP and comes back out
            // of browser storage, so it is untrusted. `//evil.test` is the one
            // that matters: a protocol-relative URL a browser follows off-site,
            // one leading slash away from a legitimate path.
            at('?code=abc&state=xyz');
            const c = client({ signinRedirectCallback: vi.fn().mockResolvedValue({ state: { returnTo } }) });

            await expect(handleCallback(c)).resolves.toEqual({ result: 'signed-in', returnTo: undefined });
        }
    );

    it('tolerates a missing state object', async () => {
        at('?code=abc&state=xyz');

        await expect(handleCallback(client())).resolves.toEqual({ result: 'signed-in', returnTo: undefined });
    });

    it('reports failure rather than throwing into the router', async () => {
        at('?code=abc&state=xyz');
        const c = client({ signinRedirectCallback: vi.fn().mockRejectedValue(new Error('invalid_grant')) });

        await expect(handleCallback(c)).resolves.toEqual({ result: 'failed' });
    });
});
