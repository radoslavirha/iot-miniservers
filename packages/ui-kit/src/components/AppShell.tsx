import type React from 'react';

export interface AppShellProps {
    readonly headerLeft: React.ReactNode;
    readonly headerRight?: React.ReactNode;
    readonly children: React.ReactNode;
}

export const AppShell = ({ headerLeft, headerRight, children }: AppShellProps): React.JSX.Element => (
    <>
        <header className="app-header">
            <div className="app-header__left">{headerLeft}</div>
            {headerRight !== undefined && <div className="app-header__right">{headerRight}</div>}
        </header>
        <main className="app-main">{children}</main>
    </>
);
