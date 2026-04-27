import { Injectable, Scope, ProviderScope } from '@tsed/di';
import QRCode from 'qrcode';
import { DEFAULT_QR_ERROR_CORRECTION } from '../constants.js';
import { QrErrorCorrection } from '../models/QrErrorCorrection.enum.js';
import { QrImageFormat } from '../models/QrImageFormat.enum.js';

export interface QrImage {
    contentType: string;
    body: Buffer | string;
}

export interface QrImageOptions {
    /** PNG output width in pixels. Ignored for SVG (vector). */
    size?: number;
    /** Error correction level. Higher = more redundancy = larger module count. Defaults to M. */
    ecLevel?: QrErrorCorrection;
}

/**
 * Renders QR codes as PNG buffers or SVG strings using the `qrcode` library.
 * Error correction defaults to `M` (~15% damage tolerance) — small enough to
 * keep prints compact while still tolerating minor wear.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrImageService {
    public async render(value: string, format: QrImageFormat, options: QrImageOptions = {}): Promise<QrImage> {
        const errorCorrectionLevel = options.ecLevel ?? DEFAULT_QR_ERROR_CORRECTION;
        if (format === QrImageFormat.SVG) {
            const body = await QRCode.toString(value, { type: 'svg', errorCorrectionLevel, margin: 1 });
            return { contentType: 'image/svg+xml', body };
        }
        const body = await QRCode.toBuffer(value, {
            type: 'png',
            errorCorrectionLevel,
            margin: 1,
            width: options.size
        });
        return { contentType: 'image/png', body };
    }
}
