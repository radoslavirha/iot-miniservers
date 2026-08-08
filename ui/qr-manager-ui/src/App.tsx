import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell, ApiStatusBanner } from '@radoslavirha/ui-kit';
import { useApiStatus } from '@radoslavirha/ui-runtime';
import { QrCodeListPage } from './pages/QrCodeListPage.js';
import { QrCodeDetailPage } from './pages/QrCodeDetailPage.js';
import { QrCodeCreatePage } from './pages/QrCodeCreatePage.js';
import { RuntimeConfigProvider } from './runtime/RuntimeConfigContext.js';
import { ApiStatusProvider } from './runtime/ApiStatusContext.js';
import type { RuntimeConfig } from './runtime/RuntimeConfig.js';

interface Props {
    config: RuntimeConfig;
}

export const App = ({ config }: Props) => {
    // No recoveryProbe: this is a hands-on admin UI, so a human is present to
    // retry. The unattended dashboard is where automatic recovery earns itself.
    const { status, report } = useApiStatus();

    return (
    <RuntimeConfigProvider value={config}>
        <ApiStatusProvider report={report}>
        <BrowserRouter basename={config.basePath}>
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
                    </nav>
                }
            >
                <ApiStatusBanner status={status} serviceName="QR Manager API" />
                <Routes>
                    <Route path="/" element={<Navigate to="/admin" replace />} />
                    <Route path="/admin" element={<QrCodeListPage />} />
                    <Route path="/admin/new" element={<QrCodeCreatePage />} />
                    <Route path="/admin/:id" element={<QrCodeDetailPage />} />
                </Routes>
            </AppShell>
        </BrowserRouter>
        </ApiStatusProvider>
    </RuntimeConfigProvider>
    );
};
