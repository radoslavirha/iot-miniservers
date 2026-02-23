import axios from 'axios';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { Serializer } from '@radoslavirha/tsed-common';
import { MiotSpecInstanceDTO } from './dto/MiotSpecInstanceDTO.js';
import { MiotSpecDTO } from './dto/MiotSpecDTO.js';
import { PropertyAccessDTO } from './dto/index.js';
import { DeviceSpec, MiotAction, MiotProperty, MiotPropertyValue, PropertyAccess } from './model/index.js';

/**
 * Class for interacting with MIoT spec
 */
export class MiotSpec {
    private static readonly INSTANCE_BASE_URL = 'https://miot-spec.org/miot-spec-v2/instance';

    static specUrl(type: string): string {
        return `${MiotSpec.INSTANCE_BASE_URL}?type=${type}`;
    }

    /**
     * Fetches the raw MIoT spec JSON for a model from miot-spec.org.
     * The result can be stored in cache and later parsed with `parseSpec`.
     * @param model Device model (e.g. 'xiaomi.vacuum.c102gl')
     */
    static async fetchRaw(model: string): Promise<MiotSpecDTO> {
        const instancesResponse = await axios.get<{ instances: MiotSpecInstanceDTO[] }>('https://miot-spec.org/miot-spec-v2/instances?status=released');
        const instances = Serializer.deserializeArray(instancesResponse.data.instances, MiotSpecInstanceDTO);
        const instance = instances.sort((a, b) => (b.ts - a.ts)).find(i => i.model === model);

        if (!instance) {
            throw new Error(`Model ${model} not found in MIoT spec`);
        }

        const specResponse = await axios.get<MiotSpecDTO>(MiotSpec.specUrl(instance.type));
        return Serializer.deserialize(specResponse.data, MiotSpecDTO);
    }

    /**
     * Parses a raw `MiotSpecDTO` (from cache or direct fetch) into a `DeviceSpec`
     * with typed Maps for properties and actions.
     * @param spec Raw MIoT spec DTO
     */
    static async parseSpec(spec: MiotSpecDTO): Promise<DeviceSpec> {
        const mappingUtils = new MappingUtils();
        const properties = new Map<string, MiotProperty>();
        const actions = new Map<string, MiotAction>();

        const validServices = spec.services.slice(1).filter(
            svc => svc.type.split(':')[1] === 'miot-spec-v2'
        );

        await mappingUtils.mapArray(validServices, async (svc) => {
            const serviceKey = svc.type.split(':')[3];

            await mappingUtils.mapOptionalArray(
                svc.properties?.filter(p => p.access.length),
                async (p) => {
                    console.log(p.valueList);
                    
                    const values = await mappingUtils.mapOptionalArray(p.valueList, async (v) =>
                        CommonUtils.buildModel(MiotPropertyValue, {
                            value: v.value,
                            description: v.description
                        })
                    );

                    properties.set(`${serviceKey}:${p.type.split(':')[3]}`, CommonUtils.buildModel(MiotProperty, {
                        siid: svc.iid,
                        piid: p.iid,
                        access: await mappingUtils.mapArray(p.access, async (access) =>
                            mappingUtils.mapEnum({ PropertyAccessDTO }, { PropertyAccess }, access)
                        ),
                        values: values ?? []
                    }));
                }
            );

            await mappingUtils.mapOptionalArray(svc.actions, async (a) => {
                actions.set(`${serviceKey}:${a.type.split(':')[3]}`, CommonUtils.buildModel(MiotAction, {
                    siid: svc.iid,
                    aiid: a.iid,
                    in: a.in
                }));
            });
        });

        return CommonUtils.buildModel(DeviceSpec, {
            name: spec.description,
            type: spec.type,
            properties,
            actions
        });
    }

    /**
     * Convenience method: fetches raw spec and parses it in one call.
     * @param model Device model (e.g. 'xiaomi.vacuum.c102gl')
     * @example
     * const spec = await MiotSpec.findModel('xiaomi.vacuum.c102gl');
     */
    static async findModel(model: string): Promise<DeviceSpec> {
        const raw = await MiotSpec.fetchRaw(model);
        return MiotSpec.parseSpec(raw);
    }
}
