import type { AppConfig, Cluster, DnsRecord, Service } from '../types.js';
import { accentColor } from './unifi.js';

interface Anchor {
    index: number;
    ip: string;
    /**
     * The anchor's own matched hostname, lower-cased. Everything downstream
     * groups CNAMEs against this — never against a reconstructed suffix, which
     * is a deployment detail (see
     * docs/superpowers/specs/2026-09-03-dashboard-hostname-refactor.md).
     */
    hostname: string;
}

function resolvePath(hostname: string, paths: Record<string, string> | undefined): string {
    if (!paths) return '';
    if (hostname in paths) return paths[hostname];
    const label = hostname.split('.')[0];
    return paths[label] ?? '';
}

/** Finds every enabled `A` record whose key matches `pattern` — the cluster anchors. */
function findAnchors(records: DnsRecord[], pattern: RegExp): Anchor[] {
    const anchors: Anchor[] = [];

    for (const r of records) {
        if (r.enabled === false || r.record_type !== 'A') continue;
        const m = pattern.exec(r.key ?? '');
        if (m) {
            anchors.push({ index: parseInt(m[1], 10), ip: r.value, hostname: (r.key ?? '').toLowerCase() });
        }
    }

    return anchors;
}

/**
 * Assigns every enabled, non-anchor record to the cluster its IP (`A`) or its
 * target anchor (`CNAME`) resolves to.
 */
function assignServices(
    records: DnsRecord[],
    anchors: Anchor[],
    pattern: RegExp,
    scheme: string,
    excluded: Set<string>,
    paths: Record<string, string> | undefined
): Map<number, Service[]> {
    const ipToIndex = new Map(anchors.map(a => [a.ip, a.index]));
    const hostToIndex = new Map(anchors.map(a => [a.hostname, a.index]));
    const clusterMap = new Map<number, Service[]>();
    for (const a of [...anchors].sort((x, y) => x.index - y.index)) clusterMap.set(a.index, []);

    for (const r of records) {
        if (r.enabled === false) continue;
        const key = r.key ?? '';
        if (pattern.test(key)) continue; // skip anchor records

        let targetIdx: number | null = null;
        if (r.record_type === 'A') {
            targetIdx = ipToIndex.get(r.value) ?? null;
        } else if (r.record_type === 'CNAME') {
            targetIdx = hostToIndex.get(r.value.toLowerCase()) ?? null;
        }

        if (targetIdx === null || !clusterMap.has(targetIdx)) continue;

        const hostname = key.toLowerCase();
        if (excluded.has(hostname)) continue;

        clusterMap.get(targetIdx)!.push({
            name: hostname.split('.')[0],
            hostname,
            url: `${scheme}://${hostname}${resolvePath(hostname, paths)}`
        });
    }

    return clusterMap;
}

export function parseDnsRecords(records: DnsRecord[], cfg: AppConfig): Cluster[] {
    const pattern = new RegExp(cfg.serverPattern, 'i');
    const scheme = cfg.scheme ?? 'http';
    const excluded = new Set((cfg.exclude ?? []).map(h => h.toLowerCase()));

    const anchors = findAnchors(records, pattern);
    if (anchors.length === 0) {
        // No anchors found — fall back to grouping A records by /24 subnet
        return fallbackBySubnet(records, scheme, excluded, cfg.paths);
    }

    const clusterMap = assignServices(records, anchors, pattern, scheme, excluded, cfg.paths);
    const ipByIndex = new Map(anchors.map(a => [a.index, a.ip]));

    return [...clusterMap.entries()]
        .map(([idx, services]) => ({
            index: idx,
            label: `server${idx}`,
            ip: ipByIndex.get(idx)!,
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
        groups.get(subnet)!.services.push({
            name: hostname.split('.')[0],
            hostname,
            url: `${scheme}://${hostname}${resolvePath(hostname, paths)}`
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

