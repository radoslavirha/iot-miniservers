import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCodeResponse } from '../../models/QrCodeResponse.js';
import { QrCodeUpdateRequest } from '../../models/QrCodeUpdateRequest.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrCodeResponseMapper } from '../../mappers/QrCodeResponseMapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeUpdateHandler {
    constructor(
        private readonly qrCodeService: QrCodeService,
        private readonly responseMapper: QrCodeResponseMapper
    ) {}

    public async execute(id: string, request: QrCodeUpdateRequest): Promise<QrCodeResponse> {
        const updated = await this.qrCodeService.update(id, request);
        if (CommonUtils.isNil(updated)) {
            throw new NotFound(`QR code ${id} not found.`);
        }
        return this.responseMapper.toResponse(updated);
    }
}
