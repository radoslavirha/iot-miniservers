import { Inject } from '@tsed/di';
import type { HttpClient } from '@radoslavirha/http-provider';
import { HttpProviderService } from './HttpProviderService.js';

/**
 * Injects the {@link HttpClient} for one configured external API.
 *
 * Built on Ts.ED's `@Inject(token, transform)`, so it resolves through the
 * container like any other dependency — there is no hidden service locator.
 *
 * @example
 * ```ts
 * @Injectable()
 * @Scope(ProviderScope.SINGLETON)
 * export class MiotSpecV2Endpoint {
 *   @InjectHttpClient(ExternalApi.MiotSpec)
 *   private readonly client!: HttpClient;
 *
 *   public async fetchSpec(type: string): Promise<MiotSpecV2DTO> {
 *     const spec = await this.client.get<object>('/instance', { params: { type } });
 *     return Serializer.deserialize(spec, MiotSpecV2DTO);
 *   }
 * }
 * ```
 *
 * @param api Key of the external API, as configured under `externalApis`.
 */
export function InjectHttpClient<K extends string>(api: K): PropertyDecorator {
    return Inject(
        HttpProviderService,
        (service: HttpProviderService<K>): HttpClient => service.get(api)
    ) as PropertyDecorator;
}
