import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { CallbackPage } from './CallbackPage.js';

const { handleCallback } = vi.hoisted(() => ({ handleCallback: vi.fn() }));
vi.mock('@radoslavirha/ui-auth', async importOriginal => ({
    ...(await importOriginal<typeof import('@radoslavirha/ui-auth')>()),
    handleCallback
}));

describe('CallbackPage', () => {
    it('shows a retry when the exchange fails', async () => {
        handleCallback.mockResolvedValue('failed');
        render(<MemoryRouter><CallbackPage client={{} as never} /></MemoryRouter>);

        await waitFor(() => expect(screen.getByText(/could not be completed/i)).toBeInTheDocument());
    });

    it('renders nothing but a status while the exchange is in flight', () => {
        handleCallback.mockReturnValue(new Promise(() => undefined));
        render(<MemoryRouter><CallbackPage client={{} as never} /></MemoryRouter>);

        expect(screen.getByText(/signing in/i)).toBeInTheDocument();
    });
});
