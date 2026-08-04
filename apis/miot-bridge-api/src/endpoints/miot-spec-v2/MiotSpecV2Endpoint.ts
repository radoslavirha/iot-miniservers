import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { InjectHttpClient, type HttpClient } from '@radoslavirha/tsed-http-provider';
import { Serializer } from '@radoslavirha/tsed-common';
import { ExternalApi } from '../../models/config/ExternalApi.enum.js';
import { MiotSpecV2InstanceDTO } from './dto/MiotSpecV2InstanceDTO.js';
import { MiotSpecV2DTO } from './dto/MiotSpecV2DTO.js';

const INSTANCES_PATH = '/instances';
const INSTANCE_PATH = '/instance';

/**
 * Service for interacting with the miot-spec.org API.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecV2Endpoint {
    @InjectHttpClient(ExternalApi.MiotSpec)
    private readonly client!: HttpClient;

    /**
     * Absolute URL of a model's spec document. It is persisted on the device
     * record, so it is composed from the configured base URL rather than left
     * relative.
     */
    public specUrl(type: string): string {
        return `${this.client.baseURL ?? ''}${INSTANCE_PATH}?type=${type}`;
    }

    /**
     * Fetches the raw MIoT spec JSON for a model from miot-spec.org.
     * The result can be stored in cache and later parsed with `parseSpec`.
     * @param model Device model (e.g. 'xiaomi.vacuum.c102gl')
     */
    public async fetchRaw(model: string): Promise<MiotSpecV2DTO> {
        const { instances } = await this.client.get<{ instances: MiotSpecV2InstanceDTO[] }>(
            INSTANCES_PATH,
            { params: { status: 'released' } }
        );

        const instance = Serializer.deserializeArray(instances, MiotSpecV2InstanceDTO)
            .sort((a, b) => (b.ts - a.ts))
            .find(i => i.model === model);

        if (!instance) {
            throw new Error(`Model ${model} not found in MIoT spec`);
        }

        const spec = await this.client.get<object>(INSTANCE_PATH, {
            params: { type: instance.type }
        });

        return Serializer.deserialize(spec, MiotSpecV2DTO);
    }
}
