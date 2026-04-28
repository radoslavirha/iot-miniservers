import { describe, expect, it } from 'vitest';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../models/QrCode.js';
import { QrType } from '../models/QrType.enum.js';
import { ConfigService } from '../services/ConfigService.js';
import { QrCodeResponseMapper } from './QrCodeResponseMapper.js';

const sampleModel = (): QrCode => CommonUtils.buildModelStrict(QrCode, {
    id: '671b00000000000000000001',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-02T00:00:00Z'),
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: QrType.IOT_DEVICE,
    active: true
});

const stubConfig = (baseURL: string, apiPublicURL: string): ConfigService =>
    ({
        config: { redirect: { baseURL } },
        api: { publicURL: apiPublicURL }
    } as unknown as ConfigService);

describe('QrCodeResponseMapper', () => {
    it('composes qrURL by joining the public base URL with the slug', () => {
        const mapper = new QrCodeResponseMapper(stubConfig('https://qr.home', 'https://api.server.home/qr'));
        const response = mapper.toResponse(sampleModel());
        expect(response.qrURL).toBe('https://qr.home/x7k2');
    });

    it('strips trailing slashes from configured base URLs', () => {
        const mapper = new QrCodeResponseMapper(stubConfig('https://qr.home///', 'https://api.server.home/qr///'));
        const response = mapper.toResponse(sampleModel());
        expect(response.qrURL).toBe('https://qr.home/x7k2');
        expect(response.imageURL).toBe('https://api.server.home/qr/qr-codes/671b00000000000000000001/image');
    });

    it('preserves all domain fields on the response', () => {
        const mapper = new QrCodeResponseMapper(stubConfig('https://qr.home', 'https://api.server.home/qr'));
        const response = mapper.toResponse(sampleModel());
        expect(response.slug).toBe('x7k2');
        expect(response.targetURL).toBe('https://iot-ui.home/devices/shelf-1');
        expect(response.label).toBe('Shelf 1');
        expect(response.type).toBe(QrType.IOT_DEVICE);
        expect(response.active).toBe(true);
        expect(response.id).toBe('671b00000000000000000001');
    });

    it('falls back to empty base when api.publicURL is not configured', () => {
        const mapper = new QrCodeResponseMapper(stubConfig('https://qr.home', undefined as unknown as string));
        const response = mapper.toResponse(sampleModel());
        expect(response.imageURL).toBe('/qr-codes/671b00000000000000000001/image');
    });
});
