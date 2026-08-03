import type { AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { PlatformTest } from '@tsed/platform-http/testing';
import { HttpProviderService } from '@radoslavirha/tsed-http-provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExternalApi } from '../../models/config/ExternalApi.enum.js';
// registers the HttpProviderService override bound to this API's config
import '../../providers/HttpProviderProvider.js';
import { MiotSpecV2Endpoint } from './MiotSpecV2Endpoint.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

/** The transport behind a client — tests mock at this level. */
const transportOf = (client: { raw: unknown }): AxiosInstance => client.raw as AxiosInstance;

const BASE_URL = 'https://miot-spec.org/miot-spec-v2';

const INSTANCES = [
    { model: 'xiaomi.vacuum.c102gl', type: 'urn:new', ts: 200 },
    { model: 'xiaomi.vacuum.c102gl', type: 'urn:old', ts: 100 },
    { model: 'other.device.v1', type: 'urn:other', ts: 300 }
];

describe('MiotSpecV2Endpoint', () => {
    let endpoint: MiotSpecV2Endpoint;
    let mock: AxiosMockAdapter;

    beforeEach(PlatformTest.create);
    beforeEach(() => {
        endpoint = PlatformTest.get<MiotSpecV2Endpoint>(MiotSpecV2Endpoint);
        const httpProvider = PlatformTest.get<HttpProviderService<ExternalApi>>(HttpProviderService);
        mock = new MockAdapter(transportOf(httpProvider.get(ExternalApi.MiotSpec)));
    });
    afterEach(PlatformTest.reset);

    it('builds an absolute spec URL from the configured base URL', () => {
        expect(endpoint.specUrl('urn:new')).toBe(`${BASE_URL}/instance?type=urn:new`);
    });

    it('fetches the newest released instance for a model', async () => {
        expect.assertions(2);
        mock.onGet('/instances').reply(200, { instances: INSTANCES });
        mock.onGet('/instance').reply(200, { type: 'urn:new', services: [] });

        const spec = await endpoint.fetchRaw('xiaomi.vacuum.c102gl');

        expect(spec.type).toBe('urn:new');
        // newest ts wins, and the model filter excludes other devices
        expect(mock.history['get']?.[1]?.params).toEqual({ type: 'urn:new' });
    });

    it('requests only released instances', async () => {
        expect.assertions(1);
        mock.onGet('/instances').reply(200, { instances: INSTANCES });
        mock.onGet('/instance').reply(200, { type: 'urn:new', services: [] });

        await endpoint.fetchRaw('xiaomi.vacuum.c102gl');

        expect(mock.history['get']?.[0]?.params).toEqual({ status: 'released' });
    });

    it('throws when the model is absent from the registry', async () => {
        expect.assertions(1);
        mock.onGet('/instances').reply(200, { instances: INSTANCES });

        await expect(endpoint.fetchRaw('unknown.model.v9'))
            .rejects.toThrow('Model unknown.model.v9 not found in MIoT spec');
    });
});
