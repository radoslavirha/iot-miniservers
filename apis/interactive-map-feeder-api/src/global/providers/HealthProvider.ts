import { HealthCheckService } from '@radoslavirha/tsed-health';
import { Injectable, ProviderScope } from '@tsed/di';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Supplies the API's health configuration to the shared service.
 *
 * Same override idiom as `LoggerProvider` and `HttpProviderProvider` — and mandatory, not
 * optional: `HealthCheckService` takes a plain config object, which Ts.ED has no token for,
 * so it cannot be resolved without an override.
 */
@Injectable({ token: HealthCheckService, scope: ProviderScope.SINGLETON })
export class HealthProvider extends HealthCheckService {
    public constructor(configService: ConfigService) {
        super(configService.config.health ?? {});
    }
}
