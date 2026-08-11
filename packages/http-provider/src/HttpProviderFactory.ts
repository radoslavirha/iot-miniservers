import axios, {
    type AxiosAdapter,
    type AxiosInstance,
    type InternalAxiosRequestConfig
} from 'axios';
import { createResiliencePolicy, type CircuitStateLike, type ResiliencePolicy } from '@radoslavirha/resilience';
import { AuthStrategy } from './schemas/auth.schema.js';
import {
    HttpProviderEntrySchema,
    type HttpProviderEntry,
    type ResolvedHttpProviderEntry
} from './schemas/provider.schema.js';
import type { TransportConfig } from './schemas/transport.schema.js';
import { JwtSelfSignedStrategy } from './strategies/JwtSelfSignedStrategy.js';
import { KubernetesServiceAccountStrategy } from './strategies/KubernetesServiceAccountStrategy.js';
import { NoAuthStrategy } from './strategies/NoAuthStrategy.js';
import { TokenExchangeStrategy } from './strategies/TokenExchangeStrategy.js';
import type { IAuthStrategy } from './strategies/IAuthStrategy.js';
import { AxiosHttpClient } from './client/AxiosHttpClient.js';
import type { HttpClient } from './client/HttpClient.js';
import { applyTransport } from './utils/applyTransport.js';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
    _retried?: boolean;
}

interface PolicyRequestConfig extends InternalAxiosRequestConfig {
    _resilienceBaseAdapter?: AxiosAdapter;
}

/**
 * A transient HTTP failure that retry/circuit-breaker policies should act on:
 * a configured 5xx-style status, or a network error (no response received).
 * Cancellations (our own timeout / an aborted caller signal) are excluded.
 */
function isRetriableHttpError(error: unknown, statusCodes: number[]): boolean {
    if (!axios.isAxiosError(error)) {
        return false;
    }
    const status = error.response?.status;
    if (status !== undefined) {
        return statusCodes.includes(status);
    }
    return error.code !== 'ERR_CANCELED';
}

/** Which client an {@link HttpProviderFactoryOptions.onInstanceCreated} call refers to. */
export type HttpInstanceRole = 'client' | 'auth';

/** Construction-time hooks that cannot come from JSON configuration. */
export interface HttpProviderFactoryOptions<K extends string = string> {
    /**
     * Called for each newly created `AxiosInstance`, **before** this factory
     * attaches its own auth and resilience interceptors.
     *
     * Ordering matters: axios runs response interceptors in registration order,
     * so anything registered here observes a raw failure before the 401 auth
     * handler can recover it. That is the seam integrations use to add
     * cross-cutting behaviour — logging, tracing, metrics — without this package
     * having to know about any of it.
     *
     * @param role `'client'` for the provider itself, `'auth'` for the internal
     *   client used by the token-exchange strategy.
     */
    onInstanceCreated?: (instance: AxiosInstance, key: K, role: HttpInstanceRole) => void;
}

export class HttpProviderFactory<K extends string> {
    private readonly clients = new Map<K, HttpClient>();
    private readonly breakerStates = new Map<K, CircuitStateLike>();
    private readonly config: Partial<Record<K, HttpProviderEntry>>;
    private readonly onInstanceCreated: HttpProviderFactoryOptions<K>['onInstanceCreated'];

    public constructor(
        config: Partial<Record<K, HttpProviderEntry>>,
        options: HttpProviderFactoryOptions<K> = {}
    ) {
        this.config = config;
        this.onInstanceCreated = options.onInstanceCreated;
    }

    /**
     * Returns the cached {@link HttpClient} for a configured provider.
     *
     * @throws when `key` has no entry in the configuration.
     */
    public get(key: K): HttpClient {
        const existing = this.clients.get(key);
        if (existing) return existing;

        const entry = this.config[key];
        if (!entry) {
            throw new Error(`HTTP provider "${key}" is not configured`);
        }

        const client = new AxiosHttpClient(this.createInstance(entry, key));
        this.clients.set(key, client);
        return client;
    }

    /**
     * Circuit breakers for the providers created so far, keyed by provider key.
     *
     * Clients are built lazily by {@link get}, so a provider that has never been used has
     * no entry here — and a provider configured without `resilience.circuitBreaker` never
     * will. Callers must treat a missing key as "no signal", not as a failure.
     *
     * Intended for reporting, not control: feed an entry to `breakerCheck` from
     * `@radoslavirha/health` to surface an upstream's state on `/health` without issuing a
     * single extra request.
     */
    public breakers(): ReadonlyMap<K, CircuitStateLike> {
        return this.breakerStates;
    }

    /**
     * Parses the raw entry so every Zod default (auth token paths, transports,
     * retriable statuses, resilience) is resolved in one place rather than
     * hand-applied here. Parsing is idempotent, so an entry that already went
     * through `HttpProvidersConfigSchema` at config load passes untouched.
     */
    private createInstance(rawEntry: HttpProviderEntry, key: K): AxiosInstance {
        const entry: ResolvedHttpProviderEntry = HttpProviderEntrySchema.parse(rawEntry);
        const instance = axios.create({ baseURL: entry.baseURL });

        // Before auth/resilience, so integrations see raw failures first.
        this.onInstanceCreated?.(instance, key, 'client');

        const strategy = this.createStrategy(entry, key);
        const transport = this.resolveTransport(entry);

        if (transport) {
            this.attachAuthInterceptor(instance, strategy, transport);
        }

        this.configureResilience(instance, entry, key);

        return instance;
    }

    /**
     * Builds the client used by {@link TokenExchangeStrategy} to call the auth
     * endpoint. It carries the same resilience policy as the provider itself —
     * an auth endpoint fails like any other dependency, and a hanging token call
     * would otherwise stall every request waiting behind it.
     */
    private createAuthClient(entry: ResolvedHttpProviderEntry, key: K): AxiosInstance {
        const client = axios.create();

        this.onInstanceCreated?.(client, key, 'auth');
        this.configureResilience(client, entry);

        return client;
    }

    /**
     * Routes every request through a cockatiel resilience policy (retry +
     * circuit breaker + timeout) when `resilience` is configured.
     *
     * The policy wraps the resolved axios **adapter** (the network call) via a
     * request interceptor, so it composes with auth interceptors and survives a
     * later `instance.defaults.adapter` swap. The timeout's `AbortSignal` is
     * threaded into the adapter and derived from the caller's signal, so both a
     * timeout and request-lifecycle cancellation abort the underlying call.
     *
     * @param recordBreakerAs when set, the policy's circuit breaker is retained under this
     *   key and exposed by {@link breakers}. Left unset for the auth client, whose policy
     *   is separate and would otherwise overwrite the provider's own breaker.
     */
    private configureResilience(
        instance: AxiosInstance,
        entry: ResolvedHttpProviderEntry,
        recordBreakerAs?: K
    ): void {
        const resilience = entry.resilience;

        if (!resilience) {
            return;
        }

        const retriableStatusCodes = entry.retriableStatusCodes;
        const policy = createResiliencePolicy(resilience, {
            shouldHandle: (error) => isRetriableHttpError(error, retriableStatusCodes)
        });

        // Retained so callers can read the breaker's state. It is the cheapest signal
        // there is about an external dependency — it comes from real traffic, so it
        // costs no extra request and cannot raise a false alarm while idle.
        if (recordBreakerAs !== undefined && policy.breaker) {
            this.breakerStates.set(recordBreakerAs, policy.breaker);
        }

        instance.interceptors.request.use((requestConfig: InternalAxiosRequestConfig) => {
            this.wrapAdapterWithPolicy(instance, requestConfig, policy);
            return requestConfig;
        });
    }

    /**
     * Replaces the request's adapter with a policy-wrapped version of whatever
     * adapter axios would otherwise use, resolved at request time. The caller's
     * signal becomes the policy's parent signal; cockatiel derives the timeout
     * signal from it and forwards the combined signal to the adapter.
     *
     * The 401 handler below replays the request config through
     * `instance.request()`, so this interceptor runs a second time. The
     * unwrapped adapter is therefore memoised on the config and always used as
     * the wrap target — wrapping the *previous* wrapper instead would nest the
     * policies, multiplying retry attempts and double-counting breaker failures.
     */
    private wrapAdapterWithPolicy(
        instance: AxiosInstance,
        requestConfig: PolicyRequestConfig,
        policy: ResiliencePolicy
    ): void {
        const baseAdapter = requestConfig._resilienceBaseAdapter
            ?? axios.getAdapter(requestConfig.adapter ?? instance.defaults.adapter);
        const parentSignal = requestConfig.signal as AbortSignal | undefined;

        requestConfig._resilienceBaseAdapter = baseAdapter;
        requestConfig.adapter = (config) =>
            policy.execute((signal) => baseAdapter({ ...config, signal }), parentSignal);
    }

    private createStrategy(entry: ResolvedHttpProviderEntry, key: K): IAuthStrategy {
        const auth = entry.auth;
        if (!auth || !('strategy' in auth) || !auth.strategy || auth.strategy === AuthStrategy.None) {
            return new NoAuthStrategy();
        }
        if (auth.strategy === AuthStrategy.KubernetesServiceAccount) {
            return new KubernetesServiceAccountStrategy(auth);
        }
        if (auth.strategy === AuthStrategy.TokenExchange) {
            return new TokenExchangeStrategy(auth, this.createAuthClient(entry, key));
        }
        if (auth.strategy === AuthStrategy.JwtSelfSigned) {
            return new JwtSelfSignedStrategy(auth);
        }
        return new NoAuthStrategy();
    }

    private resolveTransport(entry: ResolvedHttpProviderEntry): TransportConfig | undefined {
        const auth = entry.auth;
        if (!auth) return undefined;
        if ('transport' in auth) return auth.transport as TransportConfig | undefined;
        return undefined;
    }

    private attachAuthInterceptor(
        instance: AxiosInstance,
        strategy: IAuthStrategy,
        transport: TransportConfig
    ): void {
        instance.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
            const credentials = await strategy.getCredentials();
            applyTransport(config, transport, credentials);
            return config;
        });

        instance.interceptors.response.use(
            (response) => response,
            async (error: unknown) => {
                const axiosError = error as { response?: { status?: number }; config?: RetriableRequestConfig };
                if (axiosError.response?.status === 401 && axiosError.config && !axiosError.config._retried) {
                    axiosError.config._retried = true;
                    strategy.invalidate();
                    return instance.request(axiosError.config);
                }
                return Promise.reject(error);
            }
        );
    }
}
