import { Injectable, Scope, ProviderScope } from '@tsed/di';
import axios from 'axios';
import { Serializer } from '@radoslavirha/tsed-common';
import { MiotSpecInstanceDTO } from './model/dto/MiotSpecInstanceDTO.js';
import { MiotSpecDTO } from './model/dto/MiotSpecDTO.js';

/**
 * Service for interacting with the miot-spec.org API.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecV2Endpoint {
    private readonly BASE_URL = 'https://miot-spec.org/miot-spec-v2';

    public specUrl(type: string): string {
        return `${this.BASE_URL}/instance?type=${type}`;
    }

    /**
     * Fetches the raw MIoT spec JSON for a model from miot-spec.org.
     * The result can be stored in cache and later parsed with `parseSpec`.
     * @param model Device model (e.g. 'xiaomi.vacuum.c102gl')
     */
    async fetchRaw(model: string): Promise<MiotSpecDTO> {
        const instancesResponse = await axios.get<{ instances: MiotSpecInstanceDTO[] }>(`${this.BASE_URL}/instances?status=released`);
        const instances = Serializer.deserializeArray(instancesResponse.data.instances, MiotSpecInstanceDTO);
        const instance = instances.sort((a, b) => (b.ts - a.ts)).find(i => i.model === model);

        if (!instance) {
            throw new Error(`Model ${model} not found in MIoT spec`);
        }

        const specResponse = await axios.get<MiotSpecDTO>(this.specUrl(instance.type));
        return Serializer.deserialize(specResponse.data, MiotSpecDTO);
    }
}
