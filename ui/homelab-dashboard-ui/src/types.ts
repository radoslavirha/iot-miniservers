export interface AppConfig {
    title?: string;
    unifi: {
        host: string;
        apiKey: string;
        site?: string;
    };
    /** Optional JS regex string. Capture group 1 must be the numeric server index.
     *  Default: ^server(\d+)\.home$ */
    serverPattern?: string;
    /** Protocol used when building tile URLs from hostnames. Default: http */
    scheme?: string;
    /** Hostnames to hide from the dashboard (e.g. the dashboard itself).
     *  Exact match against the full DNS key, case-insensitive. */
    exclude?: string[];
    /** Path suffixes appended to tile URLs.
     *  Keys are matched first by exact hostname, then by first label (service name).
     *  Example: { "traefik": "/dashboard", "proxmox.server1.home": "/ui" } */
    paths?: Record<string, string>;
}

export interface DnsRecord {
    _id?: string;
    key: string;
    value: string;
    record_type: string;
    enabled?: boolean;
}

export interface Service {
    name: string;
    hostname: string;
    url: string;
}

export interface Cluster {
    index: number;
    label: string;
    ip: string;
    color: string;
    services: Service[];
}
