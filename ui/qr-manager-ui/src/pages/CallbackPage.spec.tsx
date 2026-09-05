import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CallbackPage } from './CallbackPage.js';

const { handleCallback, resolveAnonymous } = vi.hoisted(() => ({
    handleCallback: vi.fn(),
    resolveAnonymous: vi.fn()
}));
vi.mock('@radoslavirha/ui-auth', async importOriginal => ({
    ...(await importOriginal<typeof import('@radoslavirha/ui-auth')>()),
    handleCallback,
    useAuth: () => ({ resolveAnonymous })
}));

// Stable identity: the effect depends on `client`, and the real App memoises it.
// An inline {} would be a new object per render and re-fire the effect.
const client = {} as never;

describe('CallbackPage', () => {
    beforeEach(() => resolveAnonymous.mockClear());

    it('shows a retry when the exchange fails', async () => {
        handleCallback.mockResolvedValue('failed');
        render(<MemoryRouter><CallbackPage client={client} /></MemoryRouter>);

        await waitFor(() => expect(screen.getByText(/could not be completed/i)).toBeInTheDocument());
    });

    it('tells the provider to settle when there is no session, so it does not hang on Loading', async () => {
        // Without this the provider waits for a userLoaded event that never
        // comes, and the app shows Loading… forever instead of the sign-in page.
        handleCallback.mockResolvedValue('no-session');
        render(<MemoryRouter><CallbackPage client={client} /></MemoryRouter>);

        await waitFor(() => expect(resolveAnonymous).toHaveBeenCalled());
    });

    it('renders nothing but a status while the exchange is in flight', () => {
        handleCallback.mockReturnValue(new Promise(() => undefined));
        render(<MemoryRouter><CallbackPage client={client} /></MemoryRouter>);

        expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
});
