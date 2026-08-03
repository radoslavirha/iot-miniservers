import type { AxiosInstance } from 'axios';
import AxiosMockAdapter from 'axios-mock-adapter';
import { PlatformTest } from '@tsed/platform-http/testing';
import { HttpProviderService } from '@radoslavirha/tsed-http-provider';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExternalApi } from '../../global/models/ExternalApi.enum.js';
// registers the HttpProviderService override bound to this API's config
import '../../global/providers/HttpProviderProvider.js';
import { CHMIService } from './CHMIService.js';

const MockAdapter = AxiosMockAdapter as unknown as new (
    instance: AxiosInstance,
    options?: Record<string, unknown>
) => AxiosMockAdapter;

/** The transport behind a client — tests mock at this level. */
const transportOf = (client: { raw: unknown }): AxiosInstance => client.raw as AxiosInstance;

const BASE_URL = 'https://intranet.chmi.cz';

describe('CHMIService', () => {
    let service: CHMIService;
    let mock: AxiosMockAdapter;

    beforeEach(PlatformTest.create);
    beforeEach(() => {
        service = PlatformTest.get<CHMIService>(CHMIService);
        const httpProvider = PlatformTest.get<HttpProviderService<ExternalApi>>(HttpProviderService);
        mock = new MockAdapter(transportOf(httpProvider.get(ExternalApi.ChmiPortal)));
    });
    afterEach(PlatformTest.reset);

    it.each([
        ['getSurfaceMap', 'pacz2gmaps6.oro_col_40med.jpg'],
        ['getCitiesMap', 'pacz2gmaps6.und2.png'],
        ['getBordersMap', 'pacz2gmaps6.borders5.und.png']
    ] as const)('%s fetches its layer from the configured provider', async (method, filename) => {
        expect.assertions(3);
        mock.onGet(new RegExp(filename.replace(/\./g, '\\.'))).reply(200, Buffer.from('image-bytes'));

        const result = await service[method]();

        expect(Buffer.from(result).toString()).toBe('image-bytes');
        expect(mock.history['get']?.[0]?.url).toContain(filename);
        // path is relative — the host comes from configuration, not the source
        expect(mock.history['get']?.[0]?.url).not.toContain(BASE_URL);
    });

    it('surfaces a provider failure to the caller', async () => {
        expect.assertions(1);
        mock.onGet(/oro_col/).reply(503);

        await expect(service.getSurfaceMap()).rejects.toThrow();
    });
});
