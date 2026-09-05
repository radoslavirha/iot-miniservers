import { describe, expect, it, vi } from 'vitest';
import { handleCallback } from './handleCallback.js';
import type { AuthClient } from './createAuthClient.js';

const client = (overrides: Record<string, unknown> = {}) =>
    ({
        signinRedirectCallback: vi.fn().mockResolvedValue({}),
        signinSilentCallback: vi.fn().mockResolvedValue(undefined),
        ...overrides
    } as unknown as AuthClient);

describe('handleCallback', () => {
    it('completes a top-level login', async () => {
        const c = client();
        await expect(handleCallback(c, { isFramed: false })).resolves.toBe('signed-in');
        expect(c.signinRedirectCallback).toHaveBeenCalledOnce();
        expect(c.signinSilentCallback).not.toHaveBeenCalled();
    });

    it('completes a renewal when it is running inside the silent-renew iframe', async () => {
        const c = client();
        await expect(handleCallback(c, { isFramed: true })).resolves.toBe('silent');
        expect(c.signinSilentCallback).toHaveBeenCalledOnce();
        expect(c.signinRedirectCallback).not.toHaveBeenCalled();
    });

    it('reports failure rather than throwing into the router', async () => {
        const c = client({ signinRedirectCallback: vi.fn().mockRejectedValue(new Error('invalid_grant')) });
        await expect(handleCallback(c, { isFramed: false })).resolves.toBe('failed');
    });
});
