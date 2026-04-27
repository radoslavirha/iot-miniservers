import { Injectable, Scope, ProviderScope } from '@tsed/di';
import axios from 'axios';
import { Serializer } from '@radoslavirha/tsed-common';
import { MiotSpecV2InstanceDTO } from './dto/MiotSpecV2InstanceDTO.js';
import { MiotSpecV2DTO } from './dto/MiotSpecV2DTO.js';

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
    async fetchRaw(model: string): Promise<MiotSpecV2DTO> {
        const instancesResponse = await axios.get<{ instances: MiotSpecV2InstanceDTO[] }>(`${this.BASE_URL}/instances?status=released`);
        const instances = Serializer.deserializeArray(instancesResponse.data.instances, MiotSpecV2InstanceDTO);
        const instance = instances.sort((a, b) => (b.ts - a.ts)).find(i => i.model === model);

        if (!instance) {
            throw new Error(`Model ${model} not found in MIoT spec`);
        }

        const specResponse = await axios.get<MiotSpecV2DTO>(this.specUrl(instance.type));
        return Serializer.deserialize(specResponse.data, MiotSpecV2DTO);
    }
}
