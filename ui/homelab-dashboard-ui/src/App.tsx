import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClusterSection } from './components/ClusterSection.js';
import { Header } from './components/Header.js';
import { StatusBar } from './components/StatusBar.js';
import { fetchDnsRecords } from './lib/unifi.js';
import { parseDnsRecords } from './lib/parseDns.js';
import type { AppConfig, Cluster } from './types.js';

interface Props {
    config: AppConfig;
}

type StatusState = { state: 'loading' | 'ok' | 'error'; message: string };

export function App({ config }: Props) {
    const [clusters, setClusters] = useState<Cluster[]>([]);
    const [status, setStatus] = useState<StatusState>({
        state: 'loading',
        message: `Connecting to ${config.unifi.host}…`
    });
    const [query, setQuery] = useState('');

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setStatus({ state: 'loading', message: 'Fetching DNS records…' });
                const records = await fetchDnsRecords(config);
                if (cancelled) return;

                setStatus({ state: 'loading', message: `Parsing ${records.length} record(s)…` });
                const parsed = parseDnsRecords(records, config);
                if (cancelled) return;

                setClusters(parsed);
                setStatus({
                    state: 'ok',
                    message: `Loaded ${records.length} DNS records → ${parsed.length} cluster(s)`
                });
            } catch (err) {
                if (!cancelled) {
                    setStatus({
                        state: 'error',
                        message: err instanceof Error ? err.message : String(err)
                    });
                }
            }
        }

        void load();
        return () => {
            cancelled = true;
        };
    }, [config]);

    const filtered = useMemo(() => {
        const q = query.toLowerCase().trim();
        if (!q) return clusters;
        return clusters
            .map(c => ({
                ...c,
                services: c.services.filter(s => s.name.includes(q) || s.hostname.includes(q))
            }))
            .filter(c => c.services.length > 0);
    }, [clusters, query]);

    const handleSearch = useCallback((q: string) => setQuery(q), []);

    return (
        <>
            <Header title={config.title ?? 'homelab'} onSearch={handleSearch} />
            <StatusBar {...status} />
            <main>
                {filtered.map(c => (
                    <ClusterSection key={c.index} cluster={c} />
                ))}
                {query.trim() && filtered.length === 0 && <p className="empty visible">no matches found</p>}
            </main>
        </>
    );
}
