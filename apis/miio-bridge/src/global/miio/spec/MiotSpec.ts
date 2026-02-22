import axios from 'axios';
import { MiotSpecInstance, MiotSpecInterface } from './MiotSpec.types.js';
import { DeviceSpec, MiotAction, MiotProperty } from './DeviceSpec.types.js';

/**
 * Class for interacting with MIoT spec
 */
export class MiotSpec {
    /**
   * Finds model specification on home.miot-spec.com
   * @param model Device model
   * @example
   * const spec = await MiotSpec.findModel('xiaomi.vacuum.c102gl');
   * @returns Model specification
   */
    static async findModel(model: string): Promise<DeviceSpec> {
        try {
            const instancesResponse = await axios.get<{ instances: MiotSpecInstance[] }>('https://miot-spec.org/miot-spec-v2/instances?status=released');
            const instances = instancesResponse.data.instances;
            const instance = instances.sort((a, b) => (b.ts - a.ts)).find(instance => instance.model === model);
      
            if (!instance) {
                throw new Error(`Model ${model} not found in MIoT spec`);
            }
      
            const specResponse = await axios.get<MiotSpecInterface>(`https://miot-spec.org/miot-spec-v2/instance?type=${instance.type}`);
            const spec = specResponse.data;
      
            const properties = new Map<string, MiotProperty>();
            const actions = new Map<string, MiotAction>();
      
            for (const svc of spec.services.slice(1)) {
                const serviceTypeParts = svc.type.split(':');

                if (serviceTypeParts[1] !== 'miot-spec-v2') {
                    continue;
                }

                if (svc.properties) {
                    for (const p of svc.properties) {
                        const propertyTypeParts = p.type.split(':');
                        if (p.access.length) {
                            properties.set(`${serviceTypeParts[3]}:${propertyTypeParts[3]}`, {
                                siid: svc.iid,
                                piid: p.iid,
                                access: p.access,
                                values: p?.['value-list'] || []
                            });
                        }
                    }
                }
                if (svc.actions) {
                    for (const a of svc.actions) {
                        const actionTypeParts = a.type.split(':');
                        actions.set(`${serviceTypeParts[3]}:${actionTypeParts[3]}`, {
                            siid: svc.iid,
                            aiid: a.iid,
                            in: a.in
                        });
                    }
                }
            }
      
            return {
                name: spec.description,
                type: spec.type,
                properties,
                actions
            };
        } catch (error) {
            console.error('Error fetching model spec:', error);
            throw new Error(`Error fetching model spec for ${model}: ${error}`);
        }
    }
}
