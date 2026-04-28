import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { CommonUtils } from '@radoslavirha/utils';
import { Server } from '../Server.js';
import { QrCodeService } from '../services/QrCodeService.js';
import { QrImageService } from '../services/QrImageService.js';
import { QrCode } from '../models/QrCode.js';
import { QrErrorCorrection } from '../models/QrErrorCorrection.enum.js';
import { QrImageFormat } from '../models/QrImageFormat.enum.js';
import { QrType } from '../models/QrType.enum.js';

// test.json: redirect.baseURL = 'http://localhost:4011', api.publicURL = undefined → ''
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

describe('QrCodeController (integration)', () => {
    let request: SuperTest.Agent;
    let qrCodeService: QrCodeService;
    let qrImageService: QrImageService;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest(PlatformTest.callback());
        qrCodeService = PlatformTest.get<QrCodeService>(QrCodeService);
        qrImageService = PlatformTest.get<QrImageService>(QrImageService);
    });
    afterEach(PlatformTest.reset);
    afterEach(vi.restoreAllMocks);

    describe('POST /qr-codes', () => {
        it('returns 201 with the created QR code response', async () => {
            expect.assertions(3);
            vi.spyOn(qrCodeService, 'create').mockResolvedValue(sampleModel());

            const response = await request
                .post('/qr-codes')
                .send({ targetURL: 'https://iot-ui.home/devices/shelf-1', label: 'Shelf 1', type: QrType.IOT_DEVICE })
                .expect(201);

            expect(response.body.id).toBe('671b00000000000000000001');
            expect(response.body.slug).toBe('x7k2');
            expect(response.body.qrURL).toBe('http://localhost:4011/x7k2');
        });

        it('returns 400 when required body fields are missing', async () => {
            await request.post('/qr-codes').send({}).expect(400);
        });
    });

    describe('GET /qr-codes', () => {
        it('returns 200 with the items array', async () => {
            expect.assertions(2);
            vi.spyOn(qrCodeService, 'list').mockResolvedValue([sampleModel()]);

            const response = await request.get('/qr-codes').expect(200);

            expect(response.body.items).toHaveLength(1);
            expect(response.body.items[0].slug).toBe('x7k2');
        });

        it('forwards type and active query parameters to the service', async () => {
            expect.assertions(1);
            const listSpy = vi.spyOn(qrCodeService, 'list').mockResolvedValue([]);

            await request.get('/qr-codes?type=iot-device&active=true').expect(200);

            expect(listSpy).toHaveBeenCalledWith({ type: QrType.IOT_DEVICE, active: true });
        });
    });

    describe('GET /qr-codes/:id', () => {
        it('returns 200 with the QR code response', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());

            const response = await request.get('/qr-codes/671b00000000000000000001').expect(200);

            expect(response.body.id).toBe('671b00000000000000000001');
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(undefined);

            await request.get('/qr-codes/671b00000000000000000001').expect(404);
        });
    });

    describe('PUT /qr-codes/:id', () => {
        it('returns 200 with the updated QR code response', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'update').mockResolvedValue(sampleModel({ targetURL: 'https://new.home' }));

            const response = await request
                .put('/qr-codes/671b00000000000000000001')
                .send({ targetURL: 'https://new.home' })
                .expect(200);

            expect(response.body.targetURL).toBe('https://new.home');
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'update').mockResolvedValue(undefined);

            await request
                .put('/qr-codes/671b00000000000000000001')
                .send({ active: false })
                .expect(404);
        });
    });

    describe('DELETE /qr-codes/:id', () => {
        it('returns 204 on successful deletion', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            vi.spyOn(qrCodeService, 'delete').mockResolvedValue(undefined);

            await request.delete('/qr-codes/671b00000000000000000001').expect(204);
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(undefined);

            await request.delete('/qr-codes/671b00000000000000000001').expect(404);
        });
    });

    describe('GET /qr-codes/:id/image', () => {
        it('returns 200 with SVG content type by default', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            vi.spyOn(qrImageService, 'render').mockResolvedValue({ contentType: 'image/svg+xml', body: '<svg></svg>' });

            const response = await request.get('/qr-codes/671b00000000000000000001/image').expect(200);

            expect(response.headers['content-type']).toContain('image/svg+xml');
        });

        it('returns 200 with PNG content type when format=png', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            vi.spyOn(qrImageService, 'render').mockResolvedValue({ contentType: 'image/png', body: Buffer.from([0x89, 0x50, 0x4e, 0x47]) });

            const response = await request
                .get('/qr-codes/671b00000000000000000001/image?format=png')
                .expect(200);

            expect(response.headers['content-type']).toContain('image/png');
        });

        it('forwards size and ecLevel options to the image service', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            const renderSpy = vi.spyOn(qrImageService, 'render')
                .mockResolvedValue({ contentType: 'image/svg+xml', body: '<svg></svg>' });

            await request.get('/qr-codes/671b00000000000000000001/image?format=svg&size=256&ecLevel=H').expect(200);

            expect(renderSpy).toHaveBeenCalledWith(
                'http://localhost:4011/x7k2',
                QrImageFormat.SVG,
                { size: 256, ecLevel: QrErrorCorrection.H }
            );
        });

        it('returns 400 when the size parameter is below the minimum', async () => {
            await request.get('/qr-codes/671b00000000000000000001/image?size=32').expect(400);
        });

        it('returns 400 when the size parameter is above the maximum', async () => {
            await request.get('/qr-codes/671b00000000000000000001/image?size=5000').expect(400);
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(undefined);

            await request.get('/qr-codes/671b00000000000000000001/image').expect(404);
        });
    });
});
