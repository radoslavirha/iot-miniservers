import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../models/QrCode.js';
import { QrCodeResponse } from '../models/QrCodeResponse.js';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Builds public QrCodeResponse projections from the QrCode domain model. Adds
 * computed `qrURL` (the URL encoded into the printed QR) and `imageURL` (the URL
 * the admin UI hits to fetch the rendered image).
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
            qrURL: this.composeQrURL(model.slug),
            imageURL: this.composeImageURL(model.id)
        });
    }

    public toResponseList(models: QrCode[]): QrCodeResponse[] {
        return models.map(model => this.toResponse(model));
    }

    private composeQrURL(slug: string): string {
        return `${this.trimSlash(this.configService.config.redirect.baseURL)}/${slug}`;
    }

    private composeImageURL(id: string): string {
        const apiBase = this.configService.api.publicURL ?? '';
        return `${this.trimSlash(apiBase)}/qr-codes/${id}/image`;
    }

    private trimSlash(value: string): string {
        return value.replace(/\/+$/, '');
    }
}
