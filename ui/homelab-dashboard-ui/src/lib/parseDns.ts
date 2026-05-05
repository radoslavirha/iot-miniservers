import type { AppConfig, Cluster, DnsRecord, Service } from '../types.js';
import { accentColor } from './unifi.js';

const DEFAULT_SERVER_PATTERN = /^server(\d+)\.home$/i;

function resolvePath(hostname: string, paths: Record<string, string> | undefined): string {
    if (!paths) return '';
    if (hostname in paths) return paths[hostname];
    const label = hostname.split('.')[0];
    return paths[label] ?? '';
}

export function parseDnsRecords(records: DnsRecord[], cfg: AppConfig): Cluster[] {
    const pattern = cfg.serverPattern ? new RegExp(cfg.serverPattern, 'i') : DEFAULT_SERVER_PATTERN;
    const scheme = cfg.scheme ?? 'http';
    const excluded = new Set((cfg.exclude ?? []).map(h => h.toLowerCase()));

    // ── 1. Identify serverN anchor records ────────────────────────
    const servers = new Map<number, string>(); // serverIndex → IP

    for (const r of records) {
        if (r.enabled === false) continue;
        const m = pattern.exec(r.key ?? '');
        if (m && r.record_type === 'A') {
            servers.set(parseInt(m[1], 10), r.value);
        }
    }

    if (servers.size === 0) {
        // No anchors found — fall back to grouping A records by /24 subnet
        return fallbackBySubnet(records, scheme, excluded, cfg.paths);
    }

    // ── 2. Build lookup maps ──────────────────────────────────────
    const ipToServer = new Map<string, number>();
    const hostToServer = new Map<string, number>();
    for (const [idx, ip] of servers) {
        ipToServer.set(ip, idx);
        hostToServer.set(`server${idx}.home`, idx);
    }

    // ── 3. Assign every other enabled record to a cluster ─────────
    const sortedIndexes = [...servers.keys()].sort((a, b) => a - b);
    const clusterMap = new Map<number, Service[]>();
    for (const idx of sortedIndexes) clusterMap.set(idx, []);

    for (const r of records) {
        if (r.enabled === false) continue;
        const key = r.key ?? '';
        if (pattern.test(key)) continue; // skip anchor records

        let targetIdx: number | null = null;

        if (r.record_type === 'A') {
            targetIdx = ipToServer.get(r.value) ?? null;
        } else if (r.record_type === 'CNAME') {
            targetIdx = hostToServer.get(r.value) ?? null;
        }

        if (targetIdx !== null && clusterMap.has(targetIdx)) {
            const hostname = key.toLowerCase();
            if (excluded.has(hostname)) continue;
            const path = resolvePath(hostname, cfg.paths);
            clusterMap.get(targetIdx)!.push({
                name: hostname.split('.')[0],
                hostname,
                url: `${scheme}://${hostname}${path}`
            });
        }
    }

    // ── 4. Sort and return non-empty clusters ─────────────────────
    return [...clusterMap.entries()]
        .map(([idx, services]) => ({
            index: idx,
            label: `server${idx}`,
            ip: servers.get(idx)!,
            color: accentColor(idx),
            services: services.sort((a, b) => a.name.localeCompare(b.name))
        }))
        .filter(c => c.services.length > 0);
}

function fallbackBySubnet(
    records: DnsRecord[],
    scheme: string,
    excluded: Set<string>,
    paths?: Record<string, string>
): Cluster[] {
    const groups = new Map<string, { index: number; services: Service[] }>();
    let idx = 1;

    for (const r of records) {
        if (r.record_type !== 'A' || r.enabled === false) continue;
        const subnet = r.value.split('.').slice(0, 3).join('.');
        if (!groups.has(subnet)) groups.set(subnet, { index: idx++, services: [] });
        const hostname = (r.key ?? '').toLowerCase();
        if (excluded.has(hostname)) continue;
        const path = resolvePath(hostname, paths);
        groups.get(subnet)!.services.push({
            name: hostname.replace(/\.home$/, '').replace(/\./g, ' '),
            hostname,
            url: `${scheme}://${hostname}${path}`
        });
    }

    return [...groups.entries()].map(([subnet, g]) => ({
        index: g.index,
        label: `${subnet}.x`,
        ip: `${subnet}.x`,
        color: accentColor(g.index),
        services: g.services.sort((a, b) => a.name.localeCompare(b.name))
    }));
}
