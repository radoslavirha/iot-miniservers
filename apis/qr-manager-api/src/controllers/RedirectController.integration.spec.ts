import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { CommonUtils } from '@radoslavirha/utils';
import { Server } from '../Server.js';
import { QrCodeService } from '../services/QrCodeService.js';
import { QrCode } from '../models/QrCode.js';
import { QrType } from '../models/QrType.enum.js';

const sampleModel = (overrides: Partial<QrCode> = {}): QrCode =>
    CommonUtils.buildModelStrict(QrCode, {
        id: '671b00000000000000000001',
        createdAt: new Date('2026-04-01T00:00:00Z'),
        updatedAt: new Date('2026-04-01T00:00:00Z'),
        slug: 'x7k2',
        targetURL: 'https://iot-ui.home/devices/shelf-1',
        label: 'Shelf 1',
        type: QrType.IOT_DEVICE,
        active: true,
        ...overrides
    });

describe('RedirectController (integration)', () => {
    let request: SuperTest.Agent;
    let qrCodeService: QrCodeService;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
        qrCodeService = PlatformTest.get<QrCodeService>(QrCodeService);
    });
    afterEach(PlatformTest.reset);
    afterEach(vi.restoreAllMocks);

    it('returns 302 with a Location header pointing to the target URL', async () => {
        expect.assertions(1);
        vi.spyOn(qrCodeService, 'getBySlug').mockResolvedValue(sampleModel());

        const response = await request.get('/r/x7k2').expect(302);

        expect(response.headers['location']).toBe('https://iot-ui.home/devices/shelf-1');
    });

    it('returns 404 when the slug is not found', async () => {
        vi.spyOn(qrCodeService, 'getBySlug').mockResolvedValue(undefined);

        await request.get('/r/x7k2').expect(404);
    });

    it('returns 404 when the slug is deactivated', async () => {
        vi.spyOn(qrCodeService, 'getBySlug').mockResolvedValue(sampleModel({ active: false }));

        await request.get('/r/x7k2').expect(404);
    });

    it('returns 400 when the slug does not match the 4-character alphanumeric pattern', async () => {
        await request.get('/r/toolong').expect(400);
    });
});
