import { describe, expect, it, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell.js';

describe('<AppShell />', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('renders headerLeft content', () => {
        render(
            <AppShell headerLeft={<span>My App</span>}>
                <p>content</p>
            </AppShell>
        );
        expect(screen.getByText('My App')).toBeInTheDocument();
    });

    it('renders children inside main', () => {
        render(
            <AppShell headerLeft={<span>Logo</span>}>
                <p>page content</p>
            </AppShell>
        );
        const main = screen.getByRole('main');
        expect(main).toBeInTheDocument();
        expect(main).toHaveTextContent('page content');
    });

    it('renders headerRight when provided', () => {
        render(
            <AppShell headerLeft={<span>Logo</span>} headerRight={<nav>Nav</nav>}>
                <p>content</p>
            </AppShell>
        );
        expect(screen.getByText('Nav')).toBeInTheDocument();
    });

    it('omits headerRight container when not provided', () => {
        const { container } = render(
            <AppShell headerLeft={<span>Logo</span>}>
                <p>content</p>
            </AppShell>
        );
        expect(container.querySelector('.app-header__right')).not.toBeInTheDocument();
    });
});
