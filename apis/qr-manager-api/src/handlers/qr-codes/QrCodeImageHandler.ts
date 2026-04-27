import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { QrErrorCorrection } from '../../models/QrErrorCorrection.enum.js';
import { QrImageFormat } from '../../models/QrImageFormat.enum.js';
import { ConfigService } from '../../services/ConfigService.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrImage, QrImageService } from '../../services/QrImageService.js';

export interface QrCodeImageRequest {
    id: string;
    format: QrImageFormat;
    size?: number;
    ecLevel?: QrErrorCorrection;
}

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeImageHandler {
    constructor(
        private readonly qrCodeService: QrCodeService,
        private readonly qrImageService: QrImageService,
        private readonly configService: ConfigService
    ) {}

    public async execute(request: QrCodeImageRequest): Promise<QrImage> {
        const model = await this.qrCodeService.getById(request.id);
        if (CommonUtils.isNil(model)) {
            throw new NotFound(`QR code ${request.id} not found.`);
        }
        const url = `${this.configService.config.redirect.baseURL.replace(/\/+$/, '')}/${model.slug}`;
        return this.qrImageService.render(url, request.format, { size: request.size, ecLevel: request.ecLevel });
    }
}
