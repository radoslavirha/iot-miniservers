/**
 * Inferred from AppConfigSchema so the type and the validation cannot disagree.
 * The shape is documented on the schema itself.
 */
export type { AppConfig } from './runtime/RuntimeConfig.js';

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
