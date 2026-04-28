import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../models/QrCode.js';
import { QrCodeResponse } from '../models/QrCodeResponse.js';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Builds public QrCodeResponse projections from the QrCode domain model.
 * Adds computed `qrURL` — the URL encoded into the printed QR image.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeResponseMapper {
    constructor(private readonly configService: ConfigService) {}

    public toResponse(model: QrCode): QrCodeResponse {
        return CommonUtils.buildModelStrict(QrCodeResponse, {
            id: model.id,
            createdAt: model.createdAt,
            updatedAt: model.updatedAt,
            slug: model.slug,
            targetURL: model.targetURL,
            label: model.label,
            type: model.type,
            active: model.active,
            qrURL: this.composeQrURL(model.slug)
        });
    }

    public toResponseList(models: QrCode[]): QrCodeResponse[] {
        return models.map(model => this.toResponse(model));
    }

    private composeQrURL(slug: string): string {
        return `${this.configService.config.redirect.baseURL.replace(/\/+$/, '')}/${slug}`;
    }
}
