import { StringUtils } from '@radoslavirha/utils';
import type { InternalAxiosRequestConfig } from 'axios';
import type { TransportConfig, TransportEntry } from '../schemas/transport.schema.js';

/**
 * Resolves one transport entry to the string that goes on the wire.
 *
 * A static entry is its own value. A credential-bearing one is looked up by name
 * among what the strategy returned, wrapped in `prefix`/`suffix`.
 *
 * **An absent or blank credential throws rather than being sent.** Without this
 * a strategy that returned nothing — a token response whose shape changed, an
 * extractor naming a field that is no longer there — would put `Authorization:
 * Bearer ` on the request and the failure would surface as a 401 from the far
 * end, indistinguishable from a real refusal. The name in the message is the
 * `as` name from the extractor, which is the thing that has to be corrected.
 */
function resolveEntry(entry: TransportEntry, credentials: Record<string, string>): string {
    if ('value' in entry) {
        return entry.value;
    }

    const credential = credentials[entry.credential];
    if (!StringUtils.isNotEmpty(credential)) {
        throw new Error(
            `Transport entry "${entry.name}" needs credential "${entry.credential}", `
            + 'which the auth strategy did not produce'
        );
    }

    return `${entry.prefix ?? ''}${credential}${entry.suffix ?? ''}`;
}

/**
 * Applies transport config to an Axios request config, placing each configured
 * credential in the header or query parameter that names it.
 */
export function applyTransport(
    requestConfig: InternalAxiosRequestConfig,
    transport: TransportConfig,
    credentials: Record<string, string> = {}
): void {
    if (transport.headers) {
        requestConfig.headers ??= {} as InternalAxiosRequestConfig['headers'];
        for (const header of transport.headers) {
            requestConfig.headers.set(header.name, resolveEntry(header, credentials));
        }
    }

    if (transport.queryParams) {
        const params = (requestConfig.params ?? {}) as Record<string, string>;
        for (const qp of transport.queryParams) {
            params[qp.name] = resolveEntry(qp, credentials);
        }
        requestConfig.params = params;
    }
}
