import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppShell, StatusBar } from '@radoslavirha/ui-kit';
import { ClusterSection } from './components/ClusterSection.js';
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
    const searchRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === '/' && document.activeElement !== searchRef.current) {
                e.preventDefault();
                searchRef.current?.focus();
            }
            if (e.key === 'Escape') {
                setQuery('');
                searchRef.current?.blur();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function load() {
            try {
                setStatus({ state: 'loading', message: 'Fetching DNS records…' });
                const records = await fetchDnsRecords(config);
                if (cancelled) { return; }

                setStatus({ state: 'loading', message: `Parsing ${records.length} record(s)…` });
                const parsed = parseDnsRecords(records, config);
                if (cancelled) { return; }

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
        if (!q) { return clusters; }
        return clusters
            .map(c => ({
                ...c,
                services: c.services.filter(s => s.name.includes(q) || s.hostname.includes(q))
            }))
            .filter(c => c.services.length > 0);
    }, [clusters, query]);

    const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        setQuery(e.target.value);
    }, []);

    return (
        <AppShell
            headerLeft={
                <span className="app-logo">{config.title ?? 'Homelab dashboard'}</span>
            }
            headerRight={
                <input
                    ref={searchRef}
                    id="search"
                    className="app-search"
                    type="text"
                    placeholder="Filter services…"
                    autoComplete="off"
                    spellCheck={false}
                    value={query}
                    onChange={handleSearchChange}
                />
            }
        >
            <StatusBar status={status.state} message={status.message} />
            {filtered.map(c => (
                <ClusterSection key={c.index} cluster={c} />
            ))}
            {query.trim() && filtered.length === 0 && <p className="empty visible">no matches found</p>}
        </AppShell>
    );
}
