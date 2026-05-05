import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { StatusBar } from './StatusBar.js';

describe('<StatusBar />', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        vi.useRealTimers();
    });

    it('renders loading message', () => {
        render(<StatusBar status="loading" message="Fetching data…" />);
        expect(screen.getByText('Fetching data…')).toBeInTheDocument();
    });

    it('renders error message', () => {
        render(<StatusBar status="error" message="Something went wrong" />);
        expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('renders ok message', () => {
        render(<StatusBar status="ok" message="Done" />);
        expect(screen.getByText('Done')).toBeInTheDocument();
    });

    it('applies correct class for loading status', () => {
        const { container } = render(<StatusBar status="loading" message="Loading…" />);
        expect(container.querySelector('.status-bar--loading')).toBeInTheDocument();
    });

    it('applies correct class for error status', () => {
        const { container } = render(<StatusBar status="error" message="Error" />);
        expect(container.querySelector('.status-bar--error')).toBeInTheDocument();
    });

    it('applies correct class for ok status', () => {
        const { container } = render(<StatusBar status="ok" message="OK" />);
        expect(container.querySelector('.status-bar--ok')).toBeInTheDocument();
    });

    it('adds pulse class to dot when loading', () => {
        const { container } = render(<StatusBar status="loading" message="Loading…" />);
        expect(container.querySelector('.status-dot--pulse')).toBeInTheDocument();
    });

    it('does not add pulse class when not loading', () => {
        const { container } = render(<StatusBar status="ok" message="OK" />);
        expect(container.querySelector('.status-dot--pulse')).not.toBeInTheDocument();
    });

    it('fades out and hides after ok status', async () => {
        vi.useFakeTimers();
        render(<StatusBar status="ok" message="Done" />);

        expect(screen.getByText('Done')).toBeInTheDocument();

        await act(async () => {
            vi.advanceTimersByTime(4700);
        });

        expect(screen.queryByText('Done')).not.toBeInTheDocument();
    });
});
