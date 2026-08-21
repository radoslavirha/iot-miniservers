import type { AxiosInstance, AxiosRequestConfig, ResponseType } from 'axios';
import type {
    HttpClient,
    HttpRequest,
    HttpRequestOptions,
    HttpResponseType
} from './HttpClient.js';
import { CommonUtils } from '@radoslavirha/utils';

/** Our neutral response types mapped onto axios' vocabulary. */
const RESPONSE_TYPES: Record<HttpResponseType, ResponseType> = {
    json: 'json',
    text: 'text',
    binary: 'arraybuffer'
};

/**
 * Axios-backed {@link HttpClient}.
 *
 * The only place in this package that translates the neutral request contract
 * into transport options, so swapping the transport means writing a sibling of
 * this class rather than touching any consumer.
 */
export class AxiosHttpClient implements HttpClient {
    public constructor(public readonly raw: AxiosInstance) {}

    public get baseURL(): string | undefined {
        return this.raw.defaults.baseURL;
    }

    public get<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'GET', url });
    }

    public post<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'POST', url, body });
    }

    public put<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'PUT', url, body });
    }

    public patch<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'PATCH', url, body });
    }

    public delete<T = unknown>(url: string, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'DELETE', url });
    }

    public query<T = unknown>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<T> {
        return this.request<T>({ ...options, method: 'QUERY', url, body });
    }

    public async request<T = unknown>(request: HttpRequest): Promise<T> {
        const response = await this.raw.request<T>(this.toRequestConfig(request));
        return response.data;
    }

    private toRequestConfig(request: HttpRequest): AxiosRequestConfig {
        const { method, url, body, headers, params, signal, responseType } = request;

        return {
            method: method ?? 'GET',
            url,
            ...(CommonUtils.isUndefined(body) ? {} : { data: body }),
            ...(CommonUtils.isUndefined(headers) ? {} : { headers }),
            ...(CommonUtils.isUndefined(params) ? {} : { params }),
            ...(CommonUtils.isUndefined(signal) ? {} : { signal }),
            ...(CommonUtils.isUndefined(responseType) ? {} : { responseType: RESPONSE_TYPES[responseType] })
        };
    }
}
