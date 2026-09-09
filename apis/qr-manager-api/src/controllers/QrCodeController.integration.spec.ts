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
import { authenticateBearerJwt, mintTestToken } from '@radoslavirha/tsed-auth';

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

    /**
     * A second agent, pre-authenticated. Every admin call goes through this one;
     * `request` stays bare for the anonymous cases, so which is which is visible
     * at the call site instead of being a header somebody has to remember.
     *
     * Two agents rather than one wrapped twice: `agent.set` carries a default
     * header on every request the agent makes, which is exactly what is wanted —
     * and means an authenticated agent cannot also serve the 401 tests.
     *
     * The token is minted from `config/test.json`'s inline-key issuer row, whose
     * issuer, audience and secret are `mintTestToken`'s own defaults — so no
     * arguments are needed and the two cannot drift apart.
     */
    let api: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server));
    beforeEach(() => {
        request = SuperTest.agent(PlatformTest.callback());
        qrCodeService = PlatformTest.get<QrCodeService>(QrCodeService);
        qrImageService = PlatformTest.get<QrImageService>(QrImageService);
    });
    beforeEach(async () => {
        api = await authenticateBearerJwt(SuperTest.agent(PlatformTest.callback()));
    });
    afterEach(PlatformTest.reset);
    afterEach(vi.restoreAllMocks);

    describe('POST /qr-codes', () => {
        it('returns 201 with the created QR code response', async () => {
            expect.assertions(3);
            vi.spyOn(qrCodeService, 'create').mockResolvedValue(sampleModel());

            const response = await api
                .post('/qr-codes')
                
                .send({ targetURL: 'https://iot-ui.home/devices/shelf-1', label: 'Shelf 1', type: QrType.IOT_DEVICE })
                .expect(201);

            expect(response.body.id).toBe('671b00000000000000000001');
            expect(response.body.slug).toBe('x7k2');
            expect(response.body.qrURL).toBe('http://localhost:4011/x7k2');
        });

        it('returns 400 when required body fields are missing', async () => {
            await api.post('/qr-codes').send({}).expect(400);
        });
    });

    describe('GET /qr-codes', () => {
        it('returns 200 with the items array', async () => {
            expect.assertions(2);
            vi.spyOn(qrCodeService, 'list').mockResolvedValue([sampleModel()]);

            const response = await api.get('/qr-codes').expect(200);

            expect(response.body.items).toHaveLength(1);
            expect(response.body.items[0].slug).toBe('x7k2');
        });

        it('forwards type and active query parameters to the service', async () => {
            expect.assertions(1);
            const listSpy = vi.spyOn(qrCodeService, 'list').mockResolvedValue([]);

            await api.get('/qr-codes?type=iot-device&active=true').expect(200);

            expect(listSpy).toHaveBeenCalledWith({ type: QrType.IOT_DEVICE, active: true });
        });
    });

    describe('GET /qr-codes/:id', () => {
        it('returns 200 with the QR code response', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());

            const response = await api.get('/qr-codes/671b00000000000000000001').expect(200);

            expect(response.body.id).toBe('671b00000000000000000001');
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(undefined);

            await api.get('/qr-codes/671b00000000000000000001').expect(404);
        });
    });

    describe('PUT /qr-codes/:id', () => {
        it('returns 200 with the updated QR code response', async () => {
            expect.assertions(1);
            vi.spyOn(qrCodeService, 'update').mockResolvedValue(sampleModel({ targetURL: 'https://new.home' }));

            const response = await api
                .put('/qr-codes/671b00000000000000000001')
                
                .send({ targetURL: 'https://new.home' })
                .expect(200);

            expect(response.body.targetURL).toBe('https://new.home');
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'update').mockResolvedValue(undefined);

            await api
                .put('/qr-codes/671b00000000000000000001')
                
                .send({ active: false })
                .expect(404);
        });
    });

    describe('DELETE /qr-codes/:id', () => {
        it('returns 204 on successful deletion', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            vi.spyOn(qrCodeService, 'delete').mockResolvedValue(undefined);

            await api.delete('/qr-codes/671b00000000000000000001').expect(204);
        });

        it('returns 404 when the QR code does not exist', async () => {
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(undefined);

            await api.delete('/qr-codes/671b00000000000000000001').expect(404);
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

            const response = await api
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

    describe('Authentication', () => {
        it('refuses an admin route with no credential', async () => {
            await request.get('/qr-codes').expect(401);
        });

        it('refuses a token signed by somebody else', async () => {
            const forged = await mintTestToken({ secret: 'a-different-secret-0000000000000' });

            await request.get('/qr-codes').set('Authorization', `Bearer ${forged}`).expect(401);
        });

        it('refuses a valid token minted for another audience', async () => {
            // The refusal that separates "a token" from "a token for us". The
            // signature is perfectly good; the token simply is not ours.
            const elsewhere = await mintTestToken({ audience: 'some-other-api' });

            await request.get('/qr-codes').set('Authorization', `Bearer ${elsewhere}`).expect(401);
        });

        it('refuses an expired token', async () => {
            const stale = await mintTestToken({ expiresIn: '-5m' });

            await request.get('/qr-codes').set('Authorization', `Bearer ${stale}`).expect(401);
        });

        it('ignores a non-bearer scheme rather than treating it as a bad token', async () => {
            await request.get('/qr-codes').set('Authorization', 'Basic dXNlcjpwYXNz').expect(401);
        });

        it('leaks nothing about why the credential was refused', async () => {
            // The operator-facing detail names the audience that did not match.
            // Handing it over tells an attacker which part to fix next.
            const elsewhere = await mintTestToken({ audience: 'some-other-api' });
            const response = await request.get('/qr-codes').set('Authorization', `Bearer ${elsewhere}`);

            expect(JSON.stringify(response.body)).not.toContain('some-other-api');
        });

        it('serves the image route with no credential at all', async () => {
            // Anonymous by necessity: the UI loads it with an `<img src>`, which
            // cannot carry a header. Protecting it would break every QR image.
            vi.spyOn(qrCodeService, 'getById').mockResolvedValue(sampleModel());
            vi.spyOn(qrImageService, 'render').mockResolvedValue({
                body: Buffer.from('<svg/>'),
                contentType: 'image/svg+xml'
            });

            await request.get('/qr-codes/671b00000000000000000001/image').expect(200);
        });
    });
});
