import { describe, expect, it } from 'vitest';
import { QrErrorCorrection } from '../models/QrErrorCorrection.enum.js';
import { QrImageFormat } from '../models/QrImageFormat.enum.js';
import { QrImageService } from './QrImageService.js';

describe('QrImageService', () => {
    const service = new QrImageService();
    const URL = 'https://qr.home/x7k2';

    it('renders a PNG buffer with the PNG content type', async () => {
        const result = await service.render(URL, QrImageFormat.PNG);
        expect(result.contentType).toBe('image/png');
        expect(result.body).toBeInstanceOf(Buffer);
        const buffer = result.body as Buffer;
        // PNG magic number 89 50 4E 47
        expect(buffer.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    });

    it('renders an SVG string with the SVG content type', async () => {
        const result = await service.render(URL, QrImageFormat.SVG);
        expect(result.contentType).toBe('image/svg+xml');
        expect(typeof result.body).toBe('string');
        expect(result.body).toContain('<svg');
    });

    it('lower error correction produces fewer modules (smaller viewBox)', async () => {
        const low = (await service.render(URL, QrImageFormat.SVG, { ecLevel: QrErrorCorrection.L })).body as string;
        const high = (await service.render(URL, QrImageFormat.SVG, { ecLevel: QrErrorCorrection.H })).body as string;
        const sizeOf = (svg: string): number => {
            const match = /viewBox="0 0 (\d+) \d+"/.exec(svg);
            return match ? Number(match[1]) : 0;
        };
        expect(sizeOf(low)).toBeLessThan(sizeOf(high));
    });

    it('honours the size option for PNG output', async () => {
        const result = await service.render(URL, QrImageFormat.PNG, { size: 256 });
        const buffer = result.body as Buffer;
        // PNG IHDR chunk: bytes 16-19 = width (big-endian 32-bit)
        const width = buffer.readUInt32BE(16);
        expect(width).toBe(256);
    });
});
