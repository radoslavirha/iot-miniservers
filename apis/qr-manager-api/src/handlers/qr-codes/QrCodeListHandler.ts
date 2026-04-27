import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { QrType } from '../../models/QrType.enum.js';
import { QrCodeListResponse } from '../../models/QrCodeListResponse.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrCodeResponseMapper } from '../../mappers/QrCodeResponseMapper.js';

export interface QrCodeListQuery {
    type?: QrType;
    active?: boolean;
}

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeListHandler {
    constructor(
        private readonly qrCodeService: QrCodeService,
        private readonly responseMapper: QrCodeResponseMapper
    ) {}

    public async execute(query: QrCodeListQuery): Promise<QrCodeListResponse> {
        const items = await this.qrCodeService.list({
            type: query.type,
            active: query.active
        });
        return CommonUtils.buildModelStrict(QrCodeListResponse, {
            items: this.responseMapper.toResponseList(items)
        });
    }
}
