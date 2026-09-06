import { describe, expect, it, vi, afterEach } from 'vitest';
import { __test__, createQrCodesClient } from './qrCodes.js';
import type { QrCode } from './types.js';

const sample: QrCode = {
    id: 'id1',
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: 'iot-device',
    active: true,
    qrURL: 'https://qr.home/x7k2',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
};

const okJson = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

type FetchCall = [RequestInfo | URL, RequestInit?];

/** Every call now carries a `Headers` instance, so read it back the same way. */
const headersOf = (call: FetchCall): Headers => new Headers(call[1]?.headers);

const bodyOf = (call: FetchCall): unknown => JSON.parse(String(call[1]?.body));

/**
 * Takes a factory, not a Response: a Response body can only be read once, and
 * the multi-call tests below drive six requests through one mock.
 */
const mockFetch = (respond: () => Response) => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(respond()));
    Object.assign(globalThis, { fetch: fetchMock });
    return fetchMock;
};

afterEach(() => {
    vi.restoreAllMocks();
});

describe('buildListPath', () => {
    it('returns the bare path when filter is empty', () => {
        expect(__test__.buildListPath({})).toBe('/qr-codes');
    });

    it('encodes the type filter', () => {
        expect(__test__.buildListPath({ type: 'iot-device' })).toBe('/qr-codes?type=iot-device');
    });

    it('encodes both type and active filters', () => {
        expect(__test__.buildListPath({ type: 'plant', active: false })).toBe('/qr-codes?type=plant&active=false');
    });
});

describe('parse', () => {
    it('returns parsed JSON for 200 responses', async () => {
        const result = await __test__.parse<QrCode>(okJson(sample));
        expect(result).toEqual(sample);
    });

    it('returns undefined for 204 responses', async () => {
        const result = await __test__.parse<void>(new Response(null, { status: 204 }));
        expect(result).toBeUndefined();
    });

    it('throws with the response body when not ok', async () => {
        const response = new Response('boom', { status: 500 });
        await expect(__test__.parse(response)).rejects.toThrow(/Request failed with 500: boom/);
    });
});

describe('createQrCodesClient', () => {
    it('lists QR codes and unwraps the items array', async () => {
        const fetchMock = mockFetch(() => okJson({ items: [sample] }));
        const client = createQrCodesClient('https://api.server.home/qr');
        const items = await client.list({ type: 'iot-device' });
        expect(fetchMock.mock.calls[0][0]).toBe('https://api.server.home/qr/qr-codes?type=iot-device');
        expect(items).toEqual([sample]);
    });

    it('sends no body and no content type on a list', async () => {
        const fetchMock = mockFetch(() => okJson({ items: [] }));
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.list({});
        const call = fetchMock.mock.calls[0] as FetchCall;
        expect(call[1]?.body).toBeUndefined();
        expect(headersOf(call).get('Content-Type')).toBeNull();
    });

    it('creates a QR code via POST', async () => {
        const fetchMock = mockFetch(() => okJson(sample, 201));
        const client = createQrCodesClient('https://api.server.home/qr');
        const result = await client.create({ targetURL: 'https://x.home', label: 'X', type: 'other' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const call = fetchMock.mock.calls[0] as FetchCall;
        expect(call[1]?.method).toBe('POST');
        expect(headersOf(call).get('Content-Type')).toBe('application/json');
        expect(bodyOf(call)).toEqual({ targetURL: 'https://x.home', label: 'X', type: 'other' });
        expect(result).toEqual(sample);
    });

    it('deactivate sends active=false', async () => {
        const fetchMock = mockFetch(() => okJson({ ...sample, active: false }));
        const client = createQrCodesClient('https://api.server.home/qr');
        const result = await client.deactivate('id1');
        const call = fetchMock.mock.calls[0] as FetchCall;
        expect(call[1]?.method).toBe('PUT');
        expect(bodyOf(call)).toEqual({ active: false });
        expect(result.active).toBe(false);
    });

    it('activate sends active=true', async () => {
        const fetchMock = mockFetch(() => okJson(sample));
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.activate('id1');
        expect(bodyOf(fetchMock.mock.calls[0] as FetchCall)).toEqual({ active: true });
    });

    it('remove sends DELETE without a body', async () => {
        const fetchMock = mockFetch(() => new Response(null, { status: 204 }));
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.remove('id1');
        const call = fetchMock.mock.calls[0] as FetchCall;
        expect(call[0]).toBe('https://api.server.home/qr/qr-codes/id1');
        expect(call[1]?.method).toBe('DELETE');
        expect(call[1]?.body).toBeUndefined();
    });

    it('update sends PUT with the supplied body', async () => {
        const fetchMock = mockFetch(() => okJson(sample));
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.update('id1', { label: 'New' });
        const call = fetchMock.mock.calls[0] as FetchCall;
        expect(call[1]?.method).toBe('PUT');
        expect(bodyOf(call)).toEqual({ label: 'New' });
    });
});

describe('bearer token', () => {
    const authHeaderOf = (call: FetchCall): string | null => headersOf(call).get('Authorization');

    it('attaches the token to every call, including the two that send no body', async () => {
        const fetchMock = mockFetch(() => okJson({ items: [sample] }));
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => 'token-abc' });

        await client.list({});
        await client.create({ targetURL: 'https://x.test', label: 'L', type: 'iot-device' });
        await client.update('id1', { label: 'L2' });
        await client.deactivate('id1');
        await client.activate('id1');
        await client.remove('id1');

        expect(fetchMock).toHaveBeenCalledTimes(6);
        for (const call of fetchMock.mock.calls) {
            expect(authHeaderOf(call as FetchCall)).toBe('Bearer token-abc');
        }
    });

    it('sends no Authorization header when nobody is signed in', async () => {
        const fetchMock = mockFetch(() => okJson({ items: [] }));
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => undefined });

        await client.list({});

        expect(authHeaderOf(fetchMock.mock.calls[0] as FetchCall)).toBeNull();
    });

    it('sends no Authorization header when no token getter was supplied at all', async () => {
        // The per-target rule: a client built without a getter is a bare client.
        const fetchMock = mockFetch(() => okJson({ items: [] }));
        const client = createQrCodesClient('http://api.test');

        await client.list({});

        expect(authHeaderOf(fetchMock.mock.calls[0] as FetchCall)).toBeNull();
    });

    it('reads the token per call, so a new token is picked up without rebuilding the client', async () => {
        let current = 'first';
        const fetchMock = mockFetch(() => okJson({ items: [] }));
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => current });

        await client.list({});
        current = 'second';
        await client.list({});

        expect(authHeaderOf(fetchMock.mock.calls[0] as FetchCall)).toBe('Bearer first');
        expect(authHeaderOf(fetchMock.mock.calls[1] as FetchCall)).toBe('Bearer second');
    });

    it('keeps the JSON content type on calls that send a body', async () => {
        const fetchMock = mockFetch(() => okJson(sample));
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => 'token-abc' });

        await client.update('id1', { label: 'L2' });

        const headers = headersOf(fetchMock.mock.calls[0] as FetchCall);
        expect(headers.get('Content-Type')).toBe('application/json');
        expect(headers.get('Authorization')).toBe('Bearer token-abc');
    });

    it('still reports the outcome for the status banner', async () => {
        mockFetch(() => okJson({ items: [] }));
        const onOutcome = vi.fn();
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => 'token-abc', onOutcome });

        await client.list({});

        expect(onOutcome).toHaveBeenCalledOnce();
    });

    it('reports a transport failure and still rethrows', async () => {
        Object.assign(globalThis, { fetch: vi.fn().mockRejectedValue(new TypeError('Failed to fetch')) });
        const onOutcome = vi.fn();
        const client = createQrCodesClient('http://api.test', { getAccessToken: () => 'token-abc', onOutcome });

        await expect(client.list({})).rejects.toThrow(/Failed to fetch/);
        expect(onOutcome).toHaveBeenCalledOnce();
    });
});
