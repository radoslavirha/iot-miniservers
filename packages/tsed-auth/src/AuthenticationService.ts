import { Authenticator, JwtVerifier, createKeySource } from '@radoslavirha/auth';
import type { AuthConfig, ITokenVerifier } from '@radoslavirha/auth';
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
 * The verifier is a constructor parameter so a test can inject a
 * `FakeTokenVerifier` and drive outcomes a real one can barely be made to
 * produce. Left out, it builds the ordinary JWT verifier over whichever key
 * sources the configuration implies.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class AuthenticationService extends Authenticator {
    public constructor(config: AuthConfig, verifier: ITokenVerifier = defaultVerifier(config)) {
        super(config, verifier);
    }
}

const defaultVerifier = (config: AuthConfig): ITokenVerifier =>
    new JwtVerifier(config.trustedIssuers, createKeySource(config.trustedIssuers));
