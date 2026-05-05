import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { DefaultsUtil } from '@radoslavirha/utils';
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

        this.configureRetry(instance, entry);

        const strategy = this.createStrategy(entry);
        const transport = this.resolveTransport(entry);

        if (transport) {
            this.attachAuthInterceptor(instance, strategy, transport);
        }

        return instance;
    }

    private configureRetry(instance: AxiosInstance, entry: HttpProviderEntry): void {
        const retry = entry.retry;
        const count = DefaultsUtil.number(retry?.count, 3);
        const delay = DefaultsUtil.number(retry?.delay, 1000);
        const statusCodes = retry?.statusCodes ?? [500, 502, 503, 504];

        axiosRetry(instance, {
            retries: count,
            retryDelay: (retryCount) => retryCount * delay,
            retryCondition: (error) => {
                if (axiosRetry.isNetworkError(error)) return true;
                const status = error.response?.status;
                return status !== undefined && statusCodes.includes(status);
            }
        });
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
