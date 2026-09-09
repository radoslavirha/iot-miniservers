import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiStatusBanner } from './ApiStatusBanner.js';

describe('ApiStatusBanner', () => {
    it('renders nothing while ok', () => {
        const { container } = render(<ApiStatusBanner status="ok" serviceName="QR Manager API" />);

        expect(container).toBeEmptyDOMElement();
    });

    it('names the service when unreachable', () => {
        render(<ApiStatusBanner status="unreachable" serviceName="QR Manager API" />);

        expect(screen.getByText('Cannot reach QR Manager API.')).toBeInTheDocument();
    });

    it('says retrying when degraded', () => {
        render(<ApiStatusBanner status="degraded" serviceName="QR Manager API" />);

        expect(screen.getByText(/QR Manager API is having problems/)).toBeInTheDocument();
    });

    it('tells the user to sign in again when unauthenticated', () => {
        // Distinct from the other two on purpose: nothing is broken and nothing
        // is retrying, so "having problems — retrying" would be a lie that makes
        // the user wait for a recovery that cannot come.
        render(<ApiStatusBanner status="unauthenticated" serviceName="QR Manager API" />);

        expect(screen.getByText(/sign in again/)).toBeInTheDocument();
        expect(screen.queryByText(/retrying/)).not.toBeInTheDocument();
    });

    it.each(['degraded', 'unreachable', 'unauthenticated'] as const)('leaks no URL or status code when %s', (status) => {
        const { container } = render(<ApiStatusBanner status={status} serviceName="QR Manager API" />);

        expect(container.textContent).not.toMatch(/https?:\/\/|\b\d{3}\b/);
    });
});
