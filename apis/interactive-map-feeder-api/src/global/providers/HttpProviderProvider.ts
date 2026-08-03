import { HttpProviderService } from '@radoslavirha/tsed-http-provider';
import { Injectable, ProviderScope } from '@tsed/di';
import { ExternalApi } from '../models/ExternalApi.enum.js';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Binds the configured `externalApis` entries to the shared
 * {@link HttpProviderService} token, so every service resolving it gets clients
 * that are configured, resilient and logged. The logger is resolved by the base
 * class from the DI container.
 */
@Injectable({ token: HttpProviderService, scope: ProviderScope.SINGLETON })
export class HttpProviderProvider extends HttpProviderService<ExternalApi> {
    constructor(configService: ConfigService) {
        super(configService.config.externalApis);
    }
}
