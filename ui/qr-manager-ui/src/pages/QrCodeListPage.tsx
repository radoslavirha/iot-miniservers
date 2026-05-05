import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Filters } from '../components/Filters.js';
import { createQrCodesClient } from '../api/qrCodes.js';
import type { QrCode, QrCodeListFilter } from '../api/types.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';

export const QrCodeListPage = () => {
    const config = useRuntimeConfig();
    const client = useMemo(() => createQrCodesClient(config.apiBaseURL), [config.apiBaseURL]);

    const [filter, setFilter] = useState<QrCodeListFilter>({});
    const [items, setItems] = useState<QrCode[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        client.list(filter)
            .then(list => {
                if (!cancelled) {
                    setItems(list);
                    setLoading(false);
                }
            })
            .catch(err => {
                if (!cancelled) {
                    setError((err as Error).message);
                    setLoading(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [client, filter]);

    return (
        <section className="page page-list">
            <div className="page-header">
                <h1>QR codes</h1>
            </div>
            <Filters value={filter} onChange={setFilter} />
            {loading && <p role="status">Loading…</p>}
            {error && <p role="alert">Error: {error}</p>}
            {!loading && !error && items.length === 0 && <p>No QR codes match the current filter.</p>}
            <ul className="qr-list">
                {items.map(item => (
                    <li key={item.id} data-testid={`qr-row-${item.slug}`}>
                        <Link to={`/admin/${item.id}`}>
                            <strong>{item.label}</strong>
                            <span className="slug">{item.slug}</span>
                            <span className="type">{item.type}</span>
                            {!item.active && <span className="badge badge--inactive">inactive</span>}
                        </Link>
                    </li>
                ))}
            </ul>
        </section>
    );
};
