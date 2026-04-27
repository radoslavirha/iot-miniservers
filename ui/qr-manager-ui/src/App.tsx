import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
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
            <header className="app-header">
                <Link to="/admin" className="brand">QR Manager</Link>
                <nav>
                    <Link to="/admin">List</Link>
                    <Link to="/admin/new">New</Link>
                </nav>
            </header>
            <main>
                <Routes>
                    <Route path="/" element={<Navigate to="/admin" replace />} />
                    <Route path="/admin" element={<QrCodeListPage />} />
                    <Route path="/admin/new" element={<QrCodeCreatePage />} />
                    <Route path="/admin/:id" element={<QrCodeDetailPage />} />
                </Routes>
            </main>
        </BrowserRouter>
    </RuntimeConfigProvider>
);
