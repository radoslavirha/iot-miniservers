import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { QrCodeCreateRequest } from '../../models/QrCodeCreateRequest.js';
import { QrCodeResponse } from '../../models/QrCodeResponse.js';
import { QrCodeService } from '../../services/QrCodeService.js';
import { QrCodeResponseMapper } from '../../mappers/QrCodeResponseMapper.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeCreateHandler {
    constructor(
        private readonly qrCodeService: QrCodeService,
        private readonly responseMapper: QrCodeResponseMapper
    ) {}

    public async execute(request: QrCodeCreateRequest): Promise<QrCodeResponse> {
        const created = await this.qrCodeService.create({
            targetURL: request.targetURL,
            label: request.label,
            type: request.type,
            active: true
        });
        return this.responseMapper.toResponse(created);
    }
}
