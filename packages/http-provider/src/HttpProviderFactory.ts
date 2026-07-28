import axios, {
    type AxiosInstance,
    type InternalAxiosRequestConfig
} from 'axios';
import { createResiliencePolicy, type ResiliencePolicy } from '@radoslavirha/resilience';
import { AuthStrategy } from './schemas/auth.schema.js';
import type { HttpProviderEntry } from './schemas/provider.schema.js';
import type { TransportConfig } from './schemas/transport.schema.js';
import { JwtSelfSignedStrategy } from './strategies/JwtSelfSignedStrategy.js';
import { KubernetesServiceAccountStrategy } from './strategies/KubernetesServiceAccountStrategy.js';
import { NoAuthStrategy } from './strategies/NoAuthStrategy.js';
import { TokenExchangeStrategy } from './strategies/TokenExchangeStrategy.js';
import type { IAuthStrategy } from './strategies/IAuthStrategy.js';
import { applyTransport } from './utils/applyTransport.js';

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
    _retried?: boolean;
}

const RETRIABLE_STATUS_CODES = [500, 502, 503, 504];

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

export class HttpProviderFactory<K extends string> {
    private readonly instances = new Map<K, AxiosInstance>();
    private readonly config: Partial<Record<K, HttpProviderEntry>>;

    public constructor(config: Partial<Record<K, HttpProviderEntry>>) {
        this.config = config;
    }

    public get(key: K): AxiosInstance {
        const existing = this.instances.get(key);
        if (existing) return existing;

        const entry = this.config[key];
        if (!entry) {
            throw new Error(`HTTP provider "${key}" is not configured`);
        }

        const instance = this.createInstance(entry);
        this.instances.set(key, instance);
        return instance;
    }

    private createInstance(entry: HttpProviderEntry): AxiosInstance {
        const instance = axios.create({ baseURL: entry.baseURL });

        const strategy = this.createStrategy(entry);
        const transport = this.resolveTransport(entry);

        if (transport) {
            this.attachAuthInterceptor(instance, strategy, transport);
        }

        this.configureResilience(instance, entry);

        return instance;
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
     */
    private configureResilience(instance: AxiosInstance, entry: HttpProviderEntry): void {
        const resilience = entry.resilience;

        if (!resilience) {
            return;
        }

        const policy = createResiliencePolicy(resilience, {
            shouldHandle: (error) => isRetriableHttpError(error, RETRIABLE_STATUS_CODES)
        });

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
     */
    private wrapAdapterWithPolicy(
        instance: AxiosInstance,
        requestConfig: InternalAxiosRequestConfig,
        policy: ResiliencePolicy
    ): void {
        const resolved = axios.getAdapter(requestConfig.adapter ?? instance.defaults.adapter);
        const parentSignal = requestConfig.signal as AbortSignal | undefined;

        requestConfig.adapter = (config) =>
            policy.execute((signal) => resolved({ ...config, signal }), parentSignal);
    }

    private createStrategy(entry: HttpProviderEntry): IAuthStrategy {
        const auth = entry.auth;
        if (!auth || !('strategy' in auth) || !auth.strategy || auth.strategy === AuthStrategy.None) {
            return new NoAuthStrategy();
        }
        if (auth.strategy === AuthStrategy.KubernetesServiceAccount) {
            return new KubernetesServiceAccountStrategy(auth);
        }
        if (auth.strategy === AuthStrategy.TokenExchange) {
            return new TokenExchangeStrategy(auth);
        }
        if (auth.strategy === AuthStrategy.JwtSelfSigned) {
            return new JwtSelfSignedStrategy(auth);
        }
        return new NoAuthStrategy();
    }

    private resolveTransport(entry: HttpProviderEntry): TransportConfig | undefined {
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
