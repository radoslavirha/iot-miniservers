import { classifyError, classifyResponse } from '@radoslavirha/ui-runtime';
import type { RequestOutcome } from '@radoslavirha/ui-runtime';
import type { AppConfig, DnsRecord } from '../types.js';

export interface FetchDnsRecordsOptions {
    /** Called with the outcome of the request so the app can show one banner. */
    readonly onOutcome?: (outcome: RequestOutcome) => void;
}

/**
 * A rejected API key is a *config* fault, not an outage. Distinguishing it
 * keeps the outage banner from firing on something restarting Unifi will not fix.
 */
export class UnifiAuthError extends Error {}

export const ACCENT_COLORS = ['#5b8dd9', '#c97e3a', '#7a55c4', '#3a8a5a', '#d95b8d', '#5bc4c9'];

export function accentColor(index: number): string {
    return ACCENT_COLORS[(index - 1) % ACCENT_COLORS.length] ?? '#5b8dd9';
}

export async function fetchDnsRecords(
    cfg: AppConfig,
    options: FetchDnsRecordsOptions = {}
): Promise<DnsRecord[]> {
    const { apiKey, site = 'default' } = cfg.unifi;
    // Header name confirmed from kashalls/external-dns-unifi-webhook source
    const headers: Record<string, string> = { 'X-Api-Key': apiKey };

    // Always use relative paths so the same code works in all environments:
    //   dev     → Vite server.proxy forwards /proxy/network/* to Unifi
    //   preview → Vite preview.proxy forwards /proxy/network/* to Unifi
    //   Docker  → nginx proxy_pass forwards /proxy/network/* to Unifi
    let res: Response;
    try {
        res = await fetch(`/proxy/network/v2/api/site/${site}/static-dns`, { headers });
    } catch (error) {
        options.onOutcome?.(classifyError());
        throw error;
    }

    // 401/403 classify as client-error, so the outage banner stays down — the
    // controller is answering, our credential is wrong.
    options.onOutcome?.(classifyResponse(res));

    if (res.status === 401 || res.status === 403) {
        throw new UnifiAuthError(`Unifi API key rejected (HTTP ${res.status}).`);
    }

    if (res.ok) {
        const body = (await res.json()) as unknown;
        // Response is a direct array
        if (Array.isArray(body)) return body as DnsRecord[];
    }

    throw new Error(`Could not retrieve DNS records from Unifi (HTTP ${res.status}).`);
}
