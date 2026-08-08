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

    it.each(['degraded', 'unreachable'] as const)('leaks no URL or status code when %s', (status) => {
        const { container } = render(<ApiStatusBanner status={status} serviceName="QR Manager API" />);

        expect(container.textContent).not.toMatch(/https?:\/\/|\b\d{3}\b/);
    });
});
