import { describe, expect, it, vi } from 'vitest';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../../models/QrCode.js';
import { QrType } from '../../models/QrType.enum.js';
import { QrImageFormat } from '../../models/QrImageFormat.enum.js';
import { ConfigService } from '../../services/ConfigService.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrImageService } from '../../services/QrImageService.js';
import { QrCodeResponseMapper } from '../../mappers/QrCodeResponseMapper.js';
import { QrCodeCreateHandler } from './QrCodeCreateHandler.js';
import { QrCodeDeleteHandler } from './QrCodeDeleteHandler.js';
import { QrCodeGetHandler } from './QrCodeGetHandler.js';
import { QrCodeImageHandler } from './QrCodeImageHandler.js';
import { QrCodeListHandler } from './QrCodeListHandler.js';
import { QrCodeUpdateHandler } from './QrCodeUpdateHandler.js';

const sample = (overrides: Partial<QrCode> = {}): QrCode => CommonUtils.buildModelStrict(QrCode, {
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

const responseMapper = (): QrCodeResponseMapper => new QrCodeResponseMapper({
    config: { redirect: { baseURL: 'https://qr.home' } },
    api: { publicURL: 'https://api.server.home/qr' }
} as unknown as ConfigService);

describe('QrCodeCreateHandler', () => {
    it('persists the new mapping with active=true and returns the response', async () => {
        const create = vi.fn().mockResolvedValue(sample());
        const handler = new QrCodeCreateHandler({ create } as unknown as QrCodeService, responseMapper());
        const response = await handler.execute({
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE
        });
        expect(create).toHaveBeenCalledWith(expect.objectContaining({ active: true, type: QrType.IOT_DEVICE }));
        expect(response.qrURL).toBe('https://qr.home/x7k2');
    });
});

describe('QrCodeListHandler', () => {
    it('passes the filter through and wraps the result in an items array', async () => {
        const list = vi.fn().mockResolvedValue([sample(), sample({ id: 'b', slug: 'aaaa' })]);
        const handler = new QrCodeListHandler({ list } as unknown as QrCodeService, responseMapper());
        const response = await handler.execute({ type: QrType.IOT_DEVICE, active: true });
        expect(list).toHaveBeenCalledWith({ type: QrType.IOT_DEVICE, active: true });
        expect(response.items).toHaveLength(2);
    });
});

describe('QrCodeGetHandler', () => {
    it('returns the response when the QR exists', async () => {
        const getById = vi.fn().mockResolvedValue(sample());
        const handler = new QrCodeGetHandler({ getById } as unknown as QrCodeService, responseMapper());
        const response = await handler.execute('id');
        expect(response.id).toBe('671b00000000000000000001');
    });

    it('throws NotFound when the QR does not exist', async () => {
        const getById = vi.fn().mockResolvedValue(undefined);
        const handler = new QrCodeGetHandler({ getById } as unknown as QrCodeService, responseMapper());
        await expect(handler.execute('missing')).rejects.toThrow('not found');
    });
});

describe('QrCodeUpdateHandler', () => {
    it('returns the updated response', async () => {
        const update = vi.fn().mockResolvedValue(sample({ targetURL: 'https://new.home' }));
        const handler = new QrCodeUpdateHandler({ update } as unknown as QrCodeService, responseMapper());
        const response = await handler.execute('id', { targetURL: 'https://new.home' });
        expect(response.targetURL).toBe('https://new.home');
    });

    it('throws NotFound when the document does not exist', async () => {
        const update = vi.fn().mockResolvedValue(undefined);
        const handler = new QrCodeUpdateHandler({ update } as unknown as QrCodeService, responseMapper());
        await expect(handler.execute('missing', { active: false })).rejects.toThrow('not found');
    });
});

describe('QrCodeDeleteHandler', () => {
    it('deletes when the document exists', async () => {
        const getById = vi.fn().mockResolvedValue(sample());
        const del = vi.fn();
        const handler = new QrCodeDeleteHandler({ getById, delete: del } as unknown as QrCodeService);
        await handler.execute('id');
        expect(del).toHaveBeenCalledWith('id');
    });

    it('throws NotFound when the document is missing', async () => {
        const handler = new QrCodeDeleteHandler({
            getById: vi.fn().mockResolvedValue(undefined),
            delete: vi.fn()
        } as unknown as QrCodeService);
        await expect(handler.execute('missing')).rejects.toThrow('not found');
    });
});

describe('QrCodeImageHandler', () => {
    it('renders the QR using the configured public base URL and the slug', async () => {
        const getById = vi.fn().mockResolvedValue(sample());
        const render = vi.fn().mockResolvedValue({ contentType: 'image/png', body: Buffer.from('') });
        const handler = new QrCodeImageHandler(
            { getById } as unknown as QrCodeService,
            { render } as unknown as QrImageService,
            { config: { redirect: { baseURL: 'https://qr.home/' } } } as unknown as ConfigService
        );
        await handler.execute({ id: 'id', format: QrImageFormat.PNG });
        expect(render).toHaveBeenCalledWith('https://qr.home/x7k2', QrImageFormat.PNG, { size: undefined, ecLevel: undefined });
    });

    it('forwards size and ecLevel options to the image service', async () => {
        const getById = vi.fn().mockResolvedValue(sample());
        const render = vi.fn().mockResolvedValue({ contentType: 'image/png', body: Buffer.from('') });
        const handler = new QrCodeImageHandler(
            { getById } as unknown as QrCodeService,
            { render } as unknown as QrImageService,
            { config: { redirect: { baseURL: 'https://qr.home' } } } as unknown as ConfigService
        );
        const { QrErrorCorrection } = await import('../../models/QrErrorCorrection.enum.js');
        await handler.execute({ id: 'id', format: QrImageFormat.PNG, size: 1024, ecLevel: QrErrorCorrection.L });
        expect(render).toHaveBeenCalledWith('https://qr.home/x7k2', QrImageFormat.PNG, { size: 1024, ecLevel: QrErrorCorrection.L });
    });

    it('throws NotFound when the QR does not exist', async () => {
        const handler = new QrCodeImageHandler(
            { getById: vi.fn().mockResolvedValue(undefined) } as unknown as QrCodeService,
            { render: vi.fn() } as unknown as QrImageService,
            { config: { redirect: { baseURL: 'https://qr.home' } } } as unknown as ConfigService
        );
        await expect(handler.execute({ id: 'missing', format: QrImageFormat.PNG })).rejects.toThrow('not found');
    });
});
