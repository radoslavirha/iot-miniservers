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

export const createQrCodesClient = (apiBaseURL: string): QrCodesClient => {
    const url = (path: string) => `${apiBaseURL}${path}`;
    const json = (init: RequestInit, body?: unknown): RequestInit => ({
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
    return {
        list: async (filter) => parse<QrCodeListResponse>(await fetch(url(buildListPath(filter)))).then(r => r.items),
        create: async (request) => parse<QrCode>(await fetch(url('/qr-codes'), json({ method: 'POST' }, request))),
        update: async (id, request) => parse<QrCode>(await fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, request))),
        deactivate: async (id) => parse<QrCode>(await fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, { active: false }))),
        activate: async (id) => parse<QrCode>(await fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, { active: true }))),
        remove: async (id) => parse<void>(await fetch(url(`/qr-codes/${id}`), { method: 'DELETE' }))
    };
};

// re-exported helpers for testing
export const __test__ = { buildListPath, parse };
