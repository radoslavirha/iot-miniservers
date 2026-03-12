import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MiotSpecV2, MiotSpecV2PropertyAccess } from '../models/miot-spec-v2/index.js';
import { MiotAction, MiotProperty, MiotPropertyValue, PropertyAccess, SimplifiedMiotSpec } from '../models/simplified-miot-spec/index.js';

/**
 * Maps a raw MiotSpec (global layer) into a SimplifiedMiotSpec (global layer).
 * MiotSpec → SimplifiedMiotSpec (parsed, indexed domain model)
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class SimplifiedMiotSpecV2Mapper extends MappingUtils {
    async map(data: MiotSpecV2): Promise<SimplifiedMiotSpec> {
        const properties = new Map<string, MiotProperty>();
        const actions = new Map<string, MiotAction>();

        const validServices = data.services;

        await this.mapArray(validServices, async (svc) => {
            const serviceKey = svc.type.split(':')[3];

            await this.mapOptionalArray(
                svc.properties,
                // svc.properties?.filter(p => p.access.length),
                async (p) => {
                    const values = await this.mapOptionalArray(p.valueList, async (v) =>
                        CommonUtils.buildModelStrict(MiotPropertyValue, {
                            value: v.value,
                            description: v.description
                        })
                    );

                    properties.set(`${serviceKey}:${p.type.split(':')[3]}`, CommonUtils.buildModelStrict(MiotProperty, {
                        siid: svc.iid,
                        piid: p.iid,
                        access: await this.mapArray(p.access, async (value) => await this.mapEnum({ MiotSpecV2PropertyAccess }, { PropertyAccess }, value)),
                        values: values ?? []
                    }));
                }
            );

            await this.mapOptionalArray(svc.actions, async (a) => {
                actions.set(`${serviceKey}:${a.type.split(':')[3]}`, CommonUtils.buildModelStrict(MiotAction, {
                    siid: svc.iid,
                    aiid: a.iid,
                    in: a.in.map(piid => {
                        const inputProperty = svc.properties?.find(p => p.iid === piid);
                        if (CommonUtils.isNil(inputProperty)) {
                            throw new Error(`Action '${a.type}' references non-existent input property with PIID ${piid} in service '${svc.type}'.`);
                        }
                        return `${serviceKey}:${inputProperty.type.split(':')[3]}`;
                    })
                }));
            });
        });

        return CommonUtils.buildModelStrict(SimplifiedMiotSpec, {
            name: data.description,
            type: data.type,
            properties,
            actions
        });
    }
}
