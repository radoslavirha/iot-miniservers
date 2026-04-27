import { describe, expect, it, vi } from 'vitest';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../models/QrCode.js';
import { QrType } from '../models/QrType.enum.js';
import { QrCodeService } from '../services/QrCodeService.js';
import { RedirectHandler } from './RedirectHandler.js';

const buildModel = (overrides: Partial<QrCode> = {}): QrCode => CommonUtils.buildModelStrict(QrCode, {
    id: '671b00000000000000000001',
    createdAt: new Date(),
    updatedAt: new Date(),
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: QrType.IOT_DEVICE,
    active: true,
    ...overrides
});

const stubService = (model: QrCode | undefined): QrCodeService => ({
    getBySlug: vi.fn().mockResolvedValue(model)
} as unknown as QrCodeService);

describe('RedirectHandler', () => {
    it('returns the target URL for an active slug', async () => {
        const handler = new RedirectHandler(stubService(buildModel()));
        const { targetURL } = await handler.execute('x7k2');
        expect(targetURL).toBe('https://iot-ui.home/devices/shelf-1');
    });

    it('throws NotFound for an unknown slug', async () => {
        const handler = new RedirectHandler(stubService(undefined));
        await expect(handler.execute('zzzz')).rejects.toThrow('QR code zzzz not found');
    });

    it('throws NotFound for a deactivated slug', async () => {
        const handler = new RedirectHandler(stubService(buildModel({ active: false })));
        await expect(handler.execute('x7k2')).rejects.toThrow('QR code x7k2 not found');
    });

});
