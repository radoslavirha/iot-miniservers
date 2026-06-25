import { ResilienceConfig } from './schemas/resilience.schema.js';
import {
    createResiliencePolicy,
    type ResiliencePolicy,
    type ResiliencePolicyOptions
} from './ResiliencePolicy.js';

/**
 * Builds and caches named {@link ResiliencePolicy} instances from a config map,
 * mirroring the `HttpProviderFactory` pattern. A circuit breaker is only useful
 * when its state is **shared** across calls, so always resolve a key through the
 * factory rather than building a fresh policy per call.
 *
 * @example
 * ```ts
 * enum Dep { SpecApi = 'spec-api', Db = 'db' }
 * const factory = new ResiliencePolicyFactory<Dep>({
 *   [Dep.SpecApi]: { timeout: { ms: 5000 }, circuitBreaker: {} },
 *   [Dep.Db]:      { timeout: { ms: 2000 } }
 * });
 * await factory.get(Dep.SpecApi).execute((signal) => fetch(url, { signal }));
 * ```
 */
export class ResiliencePolicyFactory<K extends string> {
    private readonly policies = new Map<K, ResiliencePolicy>();
    private readonly config: Partial<Record<K, ResilienceConfig>>;
    private readonly options: Partial<Record<K, ResiliencePolicyOptions>>;

    public constructor(
        config: Partial<Record<K, ResilienceConfig>>,
        options: Partial<Record<K, ResiliencePolicyOptions>> = {}
    ) {
        this.config = config;
        this.options = options;
    }

    public get(key: K): ResiliencePolicy {
        const existing = this.policies.get(key);
        if (existing) {
            return existing;
        }

        const config = this.config[key];
        if (!config) {
            throw new Error(`Resilience policy "${key}" is not configured`);
        }

        const policy = createResiliencePolicy(config, this.options[key]);
        this.policies.set(key, policy);
        return policy;
    }
}
