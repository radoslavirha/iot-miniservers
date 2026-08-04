import { Inject, Injectable, ProviderScope, Scope } from '@tsed/di';
import { HttpProviderFactory, type HttpClient, type HttpInstanceRole } from '@radoslavirha/http-provider';
import { Logger } from '@radoslavirha/tsed-logger';
import type { AxiosInstance } from 'axios';
import { HTTP_CLIENT_LOG_SCOPE, attachRequestLogging } from './attachRequestLogging.js';
import { attachErrorTranslation } from './attachErrorTranslation.js';
import { ExternalApiEntrySchema, type ExternalApiEntry } from './externalApi.schema.js';
import type { ResolvedHttpLogConfig } from './logging.schema.js';

/**
 * Ts.ED-injectable wrapper around `HttpProviderFactory`.
 *
 * Adds what the framework-agnostic core deliberately leaves out: outbound
 * request/response logging and failure translation. The logger is resolved from
 * the DI container — every API overrides the `Logger` token with its own
 * configured provider — so subclasses supply only configuration.
 *
 * @example
 * ```ts
 * // apis/<api>/src/providers/HttpProviderProvider.ts
 * @Injectable({ token: HttpProviderService, scope: ProviderScope.SINGLETON })
 * export class HttpProviderProvider extends HttpProviderService<ExternalApi> {
 *   constructor(configService: ConfigService) {
 *     super(configService.config.externalApis);
 *   }
 * }
 * ```
 *
 * Do not additionally decorate the subclass with a bare `@Injectable()` —
 * `@Injectable({ token })` already replaces this provider.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class HttpProviderService<K extends string = string> {
    @Inject(Logger)
    protected readonly logger?: Logger;

    private factory?: HttpProviderFactory<K>;
    private readonly translated = new Set<K>();

    /**
     * @param externalApis Parsed `externalApis` configuration, normally straight
     *   off `ConfigService`. Defaults to empty so the unconfigured provider is
     *   still constructible by the DI container.
     */
    public constructor(protected readonly externalApis: Partial<Record<K, ExternalApiEntry>> = {}) {}

    /**
     * Returns the cached {@link HttpClient} for a configured external API.
     *
     * @throws when `key` has no entry in `externalApis`.
     */
    public get(key: K): HttpClient {
        // Built lazily: Ts.ED assigns injected properties after construction, so
        // the logger is not available yet in the constructor.
        this.factory ??= this.createFactory();

        const client = this.factory.get(key);

        if (!this.translated.has(key)) {
            // After auth/resilience, so a 401 reaches the auth retry untranslated.
            attachErrorTranslation(client.raw as AxiosInstance, key);
            this.translated.add(key);
        }

        return client;
    }

    private createFactory(): HttpProviderFactory<K> {
        // Parse each entry once here rather than per created instance, so no
        // schema work happens on the request path.
        const logging = new Map<string, ResolvedHttpLogConfig>(
            Object.entries(this.externalApis).map(([key, entry]) => [
                key,
                ExternalApiEntrySchema.parse(entry).logging
            ])
        );

        return new HttpProviderFactory<K>(this.externalApis, {
            onInstanceCreated: (instance, key, role) => this.attachLogging(instance, key, role, logging)
        });
    }

    /**
     * Attaches logging through the factory's pre-interceptor seam, so the log
     * observes a raw 401 before the auth retry recovers it.
     */
    private attachLogging(
        instance: AxiosInstance,
        key: K,
        role: HttpInstanceRole,
        logging: Map<string, ResolvedHttpLogConfig>
    ): void {
        const config = logging.get(key);

        if (!this.logger || !config) {
            return;
        }

        const name = role === 'auth' ? `${key}:auth` : key;

        attachRequestLogging(
            instance,
            this.logger.child(`${HTTP_CLIENT_LOG_SCOPE}:${name}`),
            config,
            name
        );
    }
}
