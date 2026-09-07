import { AuthenticationService } from '@radoslavirha/tsed-auth';
import { Injectable, ProviderScope } from '@tsed/di';
import { ConfigService } from '../services/ConfigService.js';

/**
 * Supplies the API's authentication configuration to the shared service.
 *
 * Same override idiom as `HealthProvider` and `LoggerProvider` — and mandatory,
 * not optional: `AuthenticationService` takes a plain config object, which Ts.ED
 * has no token for, so it cannot be resolved without an override.
 *
 * No fallback for a missing `config.auth`. The schema requires the block, so
 * reaching here without one is impossible; inventing an empty config to satisfy
 * a type would only turn a boot-time error into a runtime one.
 */
@Injectable({ token: AuthenticationService, scope: ProviderScope.SINGLETON })
export class AuthProvider extends AuthenticationService {
    public constructor(configService: ConfigService) {
        super(configService.config.auth);
    }
}
