import type { AppConfig, DnsRecord } from '../types.js';

export const ACCENT_COLORS = ['#5b8dd9', '#c97e3a', '#7a55c4', '#3a8a5a', '#d95b8d', '#5bc4c9'];

export function accentColor(index: number): string {
    return ACCENT_COLORS[(index - 1) % ACCENT_COLORS.length] ?? '#5b8dd9';
}

export async function fetchDnsRecords(cfg: AppConfig): Promise<DnsRecord[]> {
    const { apiKey, site = 'default' } = cfg.unifi;
    // Header name confirmed from kashalls/external-dns-unifi-webhook source
    const headers: Record<string, string> = { 'X-Api-Key': apiKey };

    // Always use relative paths so the same code works in all environments:
    //   dev     → Vite server.proxy forwards /proxy/network/* to Unifi
    //   preview → Vite preview.proxy forwards /proxy/network/* to Unifi
    //   Docker  → nginx proxy_pass forwards /proxy/network/* to Unifi
    const res = await fetch(`/proxy/network/v2/api/site/${site}/static-dns`, { headers });

    if (res.status === 401 || res.status === 403) {
        throw new Error(`Unifi API key rejected (HTTP ${res.status}).`);
    }

    if (res.ok) {
        const body = (await res.json()) as unknown;
        // Response is a direct array
        if (Array.isArray(body)) return body as DnsRecord[];
    }

    throw new Error(`Could not retrieve DNS records from Unifi (HTTP ${res.status}).`);
}
