import { useMemo } from 'react';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, ApiStatusBanner } from '@radoslavirha/ui-kit';
import { useApiStatus } from '@radoslavirha/ui-runtime';
import { AuthProvider, createAuthClient, useAuth } from '@radoslavirha/ui-auth';
import { QrCodeListPage } from './pages/QrCodeListPage.js';
import { QrCodeDetailPage } from './pages/QrCodeDetailPage.js';
import { QrCodeCreatePage } from './pages/QrCodeCreatePage.js';
import { CallbackPage } from './pages/CallbackPage.js';
import { RuntimeConfigProvider } from './runtime/RuntimeConfigContext.js';
import { ApiStatusProvider } from './runtime/ApiStatusContext.js';
import type { RuntimeConfig } from './runtime/RuntimeConfig.js';

interface Props {
    config: RuntimeConfig;
}

const AuthControls = () => {
    const { state, username, login, logout, signOutEverywhere } = useAuth();

    if (state === 'loading') {
        return <span className="app-nav-link">…</span>;
    }

    if (state === 'anonymous') {
        return <button className="app-nav-link" onClick={() => void login()}>Log in</button>;
    }

    return (
        <>
            <span className="app-nav-link">{username}</span>
            <button className="app-nav-link" onClick={() => void logout()}>Log out</button>
            {/*
              RP-initiated logout leaves the Authentik session alive, so Log out
              then Log in signs you straight back in with no prompt. On a shared
              browser that is not a logout, which is what this second action is for.
            */}
            <button className="app-nav-link" onClick={signOutEverywhere}>Sign out everywhere</button>
        </>
    );
};

export const App = ({ config }: Props) => {
    // No recoveryProbe: this is a hands-on admin UI, so a human is present to
    // retry. The unattended dashboard is where automatic recovery earns itself.
    const { status, report } = useApiStatus();
    const authClient = useMemo(() => createAuthClient(config.auth), [config.auth]);

    return (
    <RuntimeConfigProvider value={config}>
        <ApiStatusProvider report={report}>
        <BrowserRouter basename={config.basePath}>
            {/* Inside BrowserRouter: CallbackPage navigates once the exchange lands. */}
            <AuthProvider client={authClient}>
            <AppShell
                headerLeft={
                    <Link to="/admin" className="app-logo">QR Manager</Link>
                }
                headerRight={
                    <nav className="app-nav">
                        <NavLink to="/admin" end className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
                            List
                        </NavLink>
                        <NavLink to="/admin/new" className={({ isActive }) => `app-nav-link${isActive ? ' active' : ''}`}>
                            New
                        </NavLink>
                        <AuthControls />
                    </nav>
                }
            >
                <ApiStatusBanner status={status} serviceName="QR Manager API" />
                {/*
                  No route is guarded. Access is decided at the IdP: a user
                  outside qr-manager-server1-sandbox-admin never reaches the
                  callback at all. A guard here would be duplicated policy that
                  drifts away from the group membership that actually decides.
                */}
                <Routes>
                    <Route path="/" element={<Navigate to="/admin" replace />} />
                    <Route path="/callback" element={<CallbackPage client={authClient} />} />
                    <Route path="/admin" element={<QrCodeListPage />} />
                    <Route path="/admin/new" element={<QrCodeCreatePage />} />
                    <Route path="/admin/:id" element={<QrCodeDetailPage />} />
                </Routes>
            </AppShell>
            </AuthProvider>
        </BrowserRouter>
        </ApiStatusProvider>
    </RuntimeConfigProvider>
    );
};
