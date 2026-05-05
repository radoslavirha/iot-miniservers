import type { InternalAxiosRequestConfig } from 'axios';
import type { TransportConfig } from '../schemas/transport.schema.js';

/**
 * Applies transport config to an Axios request config, interpolating
 * `{{name}}` placeholders with values from the provided credentials map.
 *
 * Static transport entries (no `{{}}`) are injected as-is.
 * Dynamic entries require a matching key in `credentials`.
 */
export function applyTransport(
    requestConfig: InternalAxiosRequestConfig,
    transport: TransportConfig,
    credentials: Record<string, string> = {}
): void {
    const interpolate = (template: string): string =>
        template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
            if (!(key in credentials)) {
                throw new Error(`Transport placeholder "{{${key}}}" has no matching credential`);
            }
            return credentials[key]!;
        });

    if (transport.headers) {
        requestConfig.headers ??= {} as InternalAxiosRequestConfig['headers'];
        for (const header of transport.headers) {
            requestConfig.headers.set(header.name, interpolate(header.value));
        }
    }

    if (transport.queryParams) {
        const params = (requestConfig.params ?? {}) as Record<string, string>;
        for (const qp of transport.queryParams) {
            params[qp.name] = interpolate(qp.value);
        }
        requestConfig.params = params;
    }
}
