import { BrowserRouter, Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@radoslavirha/ui-kit';
import { QrCodeListPage } from './pages/QrCodeListPage.js';
import { QrCodeDetailPage } from './pages/QrCodeDetailPage.js';
import { QrCodeCreatePage } from './pages/QrCodeCreatePage.js';
import { RuntimeConfigProvider } from './runtime/RuntimeConfigContext.js';
import type { RuntimeConfig } from './runtime/RuntimeConfig.js';

interface Props {
    config: RuntimeConfig;
}

export const App = ({ config }: Props) => (
    <RuntimeConfigProvider value={config}>
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
                <Routes>
                    <Route path="/" element={<Navigate to="/admin" replace />} />
                    <Route path="/admin" element={<QrCodeListPage />} />
                    <Route path="/admin/new" element={<QrCodeCreatePage />} />
                    <Route path="/admin/:id" element={<QrCodeDetailPage />} />
                </Routes>
            </AppShell>
        </BrowserRouter>
    </RuntimeConfigProvider>
);
