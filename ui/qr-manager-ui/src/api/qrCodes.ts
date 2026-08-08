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
}

export const createQrCodesClient = (apiBaseURL: string, options: QrCodesClientOptions = {}): QrCodesClient => {
    const url = (path: string) => `${apiBaseURL}${path}`;
    const json = (init: RequestInit, body?: unknown): RequestInit => ({
        ...init,
        headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    /**
     * Reports the outcome, then hands the response back untouched. Errors keep
     * propagating exactly as before — the status model is additive, so per-page
     * error rendering is unchanged.
     */
    const observe = async (request: Promise<Response>): Promise<Response> => {
        try {
            const response = await request;
            options.onOutcome?.(classifyResponse(response));
            return response;
        } catch (error) {
            options.onOutcome?.(classifyError());
            throw error;
        }
    };

    return {
        list: async (filter) => parse<QrCodeListResponse>(await observe(fetch(url(buildListPath(filter))))).then(r => r.items),
        create: async (request) => parse<QrCode>(await observe(fetch(url('/qr-codes'), json({ method: 'POST' }, request)))),
        update: async (id, request) => parse<QrCode>(await observe(fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, request)))),
        deactivate: async (id) => parse<QrCode>(await observe(fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, { active: false })))),
        activate: async (id) => parse<QrCode>(await observe(fetch(url(`/qr-codes/${id}`), json({ method: 'PUT' }, { active: true })))),
        remove: async (id) => parse<void>(await observe(fetch(url(`/qr-codes/${id}`), { method: 'DELETE' })))
    };
};

// re-exported helpers for testing
export const __test__ = { buildListPath, parse };
