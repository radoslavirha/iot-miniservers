import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCodeResponse } from '../../models/QrCodeResponse.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrCodeResponseMapper } from '../../mappers/QrCodeResponseMapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeGetHandler {
    constructor(
        private readonly qrCodeService: QrCodeService,
        private readonly responseMapper: QrCodeResponseMapper
    ) {}

    public async execute(id: string): Promise<QrCodeResponse> {
        const model = await this.qrCodeService.getById(id);
        if (CommonUtils.isNil(model)) {
            throw new NotFound(`QR code ${id} not found.`);
        }
        return this.responseMapper.toResponse(model);
    }
}
