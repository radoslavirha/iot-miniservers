import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCodeService } from '../services/QrCodeService.js';

export interface RedirectResult {
    targetURL: string;
}

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class RedirectHandler {
    constructor(
        private readonly qrCodeService: QrCodeService
    ) {}

    public async execute(slug: string, signal?: AbortSignal): Promise<RedirectResult> {
        const model = await this.qrCodeService.getBySlug(slug, signal);
        if (CommonUtils.isNil(model) || !model.active) {
            throw new NotFound(`QR code ${slug} not found.`);
        }
        return { targetURL: model.targetURL };
    }
}
