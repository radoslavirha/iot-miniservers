import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCodeService } from '../../services/QrCodeService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class QrCodeDeleteHandler {
    constructor(
        private readonly qrCodeService: QrCodeService
    ) {}

    public async execute(id: string): Promise<void> {
        const existing = await this.qrCodeService.getById(id);
        if (CommonUtils.isNil(existing)) {
            throw new NotFound(`QR code ${id} not found.`);
        }
        await this.qrCodeService.delete(id);
    }
}
