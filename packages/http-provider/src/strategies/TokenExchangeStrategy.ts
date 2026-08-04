import axios, { type AxiosInstance } from 'axios';
import type { TokenExchangeAuth, TokenExtractorEntry } from '../schemas/auth.schema.js';
import { extractByPath } from '../utils/extractByPath.js';
import type { IAuthStrategy } from './IAuthStrategy.js';

export class TokenExchangeStrategy implements IAuthStrategy {
    private cachedCredentials: Record<string, string> | undefined;
    private inFlightCredentials: Promise<Record<string, string>> | undefined;
    private inFlightEpoch: number | undefined;
    private cacheEpoch: number = 0;
    private readonly extractors: TokenExtractorEntry[];
    private readonly client: AxiosInstance;

    /**
     * @param client Client used for the token request. `HttpProviderFactory`
     *   supplies one carrying the provider's resilience policy and logging, so
     *   the auth hop is bounded and observable like any other call. Defaults to
     *   the bare axios instance for standalone use.
     */
    public constructor(
        private readonly config: TokenExchangeAuth,
        client: AxiosInstance = axios
    ) {
        this.extractors = config.tokenExtractor;
        this.client = client;
    }

    public async getCredentials(): Promise<Record<string, string>> {
        if (this.cachedCredentials) {
            return this.cachedCredentials;
        }

        if (this.inFlightCredentials && this.inFlightEpoch === this.cacheEpoch) {
            return this.inFlightCredentials;
        }

        const requestEpoch = this.cacheEpoch;
        this.inFlightEpoch = requestEpoch;
        this.inFlightCredentials = this.fetchCredentials()
            .then((credentials) => {
                if (this.cacheEpoch === requestEpoch) {
                    this.cachedCredentials = credentials;
                }
                return credentials;
            })
            .finally(() => {
                if (this.inFlightEpoch === requestEpoch) {
                    this.inFlightCredentials = undefined;
                    this.inFlightEpoch = undefined;
                }
            });

        return this.inFlightCredentials;
    }

    public invalidate(): void {
        this.cacheEpoch += 1;
        this.cachedCredentials = undefined;
    }

    private async fetchCredentials(): Promise<Record<string, string>> {
        const { method, url, headers, queryParams, body } = this.config.request;

        const requestHeaders: Record<string, string> = {};
        if (headers) {
            for (const h of headers) {
                requestHeaders[h.name] = h.value;
            }
        }

        const requestParams: Record<string, string> = {};
        if (queryParams) {
            for (const qp of queryParams) {
                requestParams[qp.name] = qp.value;
            }
        }

        const response = await this.client.request<unknown>({
            method,
            url,
            headers: requestHeaders,
            params: requestParams,
            data: body
        });

        const credentials: Record<string, string> = {};
        for (const extractor of this.extractors) {
            credentials[extractor.as] = extractByPath(response.data, extractor.field);
        }
        return credentials;
    }
}
