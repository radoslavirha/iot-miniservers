import { Authenticator } from '@radoslavirha/auth';
import { Injectable, ProviderScope, Scope } from '@tsed/di';

/**
 * The `Authenticator` the guard injects.
 *
 * Configuration comes in through the constructor, matching `Logger`,
 * `HttpProviderService` and `HealthCheckService`. An app supplies it by
 * overriding the token, exactly as it already overrides those:
 *
 * ```ts
 * @Injectable({ token: AuthenticationService, scope: ProviderScope.SINGLETON })
 * export class AuthProvider extends AuthenticationService {
 *   public constructor(configService: ConfigService) {
 *     super(configService.config.auth);
 *   }
 * }
 * ```
 *
 * **The override is mandatory, not optional.** Ts.ED reads `design:paramtypes`
 * and cannot resolve a plain config object — it has no DI token — so resolving
 * this class without an override fails with "Given token is undefined". That is
 * the same contract the three services above carry.
 *
 * Nothing but the decorators: building a verifier per configured method is
 * `Authenticator`'s own job, and lives in `@radoslavirha/auth` where a non-Ts.ED
 * transport can reach it too.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class AuthenticationService extends Authenticator {}
