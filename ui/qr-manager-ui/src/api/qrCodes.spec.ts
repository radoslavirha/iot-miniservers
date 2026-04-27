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
    imageURL: 'https://api.server.home/qr/qr-codes/id1/image',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
};

const okJson = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
});

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
        const fetchMock = vi.fn().mockResolvedValue(okJson({ items: [sample] }));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        const items = await client.list({ type: 'iot-device' });
        expect(fetchMock).toHaveBeenCalledWith('https://api.server.home/qr/qr-codes?type=iot-device');
        expect(items).toEqual([sample]);
    });

    it('creates a QR code via POST', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson(sample, 201));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        const result = await client.create({ targetURL: 'https://x.home', label: 'X', type: 'other' });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('POST');
        expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
        expect(JSON.parse(init.body)).toEqual({ targetURL: 'https://x.home', label: 'X', type: 'other' });
        expect(result).toEqual(sample);
    });

    it('deactivate sends active=false', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson({ ...sample, active: false }));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        const result = await client.deactivate('id1');
        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual({ active: false });
        expect(result.active).toBe(false);
    });

    it('activate sends active=true', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson(sample));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.activate('id1');
        const [, init] = fetchMock.mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({ active: true });
    });

    it('remove sends DELETE without a body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.remove('id1');
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://api.server.home/qr/qr-codes/id1');
        expect(init.method).toBe('DELETE');
    });

    it('update sends PUT with the supplied body', async () => {
        const fetchMock = vi.fn().mockResolvedValue(okJson(sample));
        Object.assign(globalThis, { fetch: fetchMock });
        const client = createQrCodesClient('https://api.server.home/qr');
        await client.update('id1', { label: 'New' });
        const [, init] = fetchMock.mock.calls[0];
        expect(init.method).toBe('PUT');
        expect(JSON.parse(init.body)).toEqual({ label: 'New' });
    });
});
