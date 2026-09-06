import { classifyError, classifyResponse } from '@radoslavirha/ui-runtime';
import type { RequestOutcome } from '@radoslavirha/ui-runtime';
import type {
    QrCode,
    QrCodeCreateRequest,
    QrCodeListFilter,
    QrCodeListResponse,
    QrCodeUpdateRequest
} from './types.js';

const buildListPath = (filter: QrCodeListFilter): string => {
    const params = new URLSearchParams();
    if (filter.type) {
        params.set('type', filter.type);
    }
    if (filter.active !== undefined) {
        params.set('active', String(filter.active));
    }
    const query = params.toString();
    return query ? `/qr-codes?${query}` : '/qr-codes';
};

const parse = async <T>(response: Response): Promise<T> => {
    if (!response.ok) {
        const body = await response.text();
        throw new Error(`Request failed with ${response.status}: ${body}`);
    }
    if (response.status === 204) {
        return undefined as T;
    }
    return response.json() as Promise<T>;
};

export interface QrCodesClient {
    list(filter: QrCodeListFilter): Promise<QrCode[]>;
    create(request: QrCodeCreateRequest): Promise<QrCode>;
    update(id: string, request: QrCodeUpdateRequest): Promise<QrCode>;
    deactivate(id: string): Promise<QrCode>;
    activate(id: string): Promise<QrCode>;
    remove(id: string): Promise<void>;
}

export interface QrCodesClientOptions {
    /**
     * Called with the outcome of every request, so the app can show one
     * degraded-backend banner instead of a raw error per page. Optional — the
     * client works identically without it.
     */
    readonly onOutcome?: (outcome: RequestOutcome) => void;
    /**
     * Supplies the current access token, or undefined when there is none.
     *
     * Injected per client rather than installed globally on `fetch`: this token
     * is minted for qr-manager-api and must never be attached to a third-party
     * call. A client built without this getter sends no credential at all.
     */
    readonly getAccessToken?: () => string | undefined;
}

export const createQrCodesClient = (apiBaseURL: string, options: QrCodesClientOptions = {}): QrCodesClient => {
    const url = (path: string) => `${apiBaseURL}${path}`;

    /**
     * The single seam every call passes through — named `send` so the six client
     * methods can keep their `request` parameter name. It exists because headers
     * used to flow only through the JSON helper, which `list` and `remove` never
     * called — so a header added there would have covered four of six calls and
     * left the list and delete endpoints anonymous.
     */
    const send = async (path: string, init: RequestInit = {}, body?: unknown): Promise<Response> => {
        const headers = new Headers(init.headers);
        if (body !== undefined) {
            headers.set('Content-Type', 'application/json');
        }
        // Read through on every call rather than capturing at construction: the
        // token is replaced when the session is recovered, and a captured value
        // would go stale without anything rebuilding the client.
        const token = options.getAccessToken?.();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        }

        try {
            const response = await fetch(url(path), {
                ...init,
                headers,
                body: body === undefined ? undefined : JSON.stringify(body)
            });
            options.onOutcome?.(classifyResponse(response));
            return response;
        } catch (error) {
            options.onOutcome?.(classifyError());
            throw error;
        }
    };

    return {
        list: async (filter) => parse<QrCodeListResponse>(await send(buildListPath(filter))).then(r => r.items),
        create: async (request) => parse<QrCode>(await send('/qr-codes', { method: 'POST' }, request)),
        update: async (id, request) => parse<QrCode>(await send(`/qr-codes/${id}`, { method: 'PUT' }, request)),
        deactivate: async (id) => parse<QrCode>(await send(`/qr-codes/${id}`, { method: 'PUT' }, { active: false })),
        activate: async (id) => parse<QrCode>(await send(`/qr-codes/${id}`, { method: 'PUT' }, { active: true })),
        remove: async (id) => parse<void>(await send(`/qr-codes/${id}`, { method: 'DELETE' }))
    };
};

// re-exported helpers for testing
export const __test__ = { buildListPath, parse };
