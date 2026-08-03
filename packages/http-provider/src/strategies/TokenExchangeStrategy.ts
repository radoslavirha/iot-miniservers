import axios, { type AxiosInstance } from 'axios';
import type { TokenExchangeAuth, TokenExtractorEntry } from '../schemas/auth.schema.js';
import { extractByPath } from '../utils/extractByPath.js';
import type { IAuthStrategy } from './IAuthStrategy.js';

export class TokenExchangeStrategy implements IAuthStrategy {
    private cachedCredentials: Record<string, string> | undefined;
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
        if (!this.cachedCredentials) {
            this.cachedCredentials = await this.fetchCredentials();
        }
        return this.cachedCredentials;
    }

    public invalidate(): void {
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
