import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MiotSpec } from '../../global/models/miio-spec-v2/index.js';
import { MiotAction, MiotProperty, MiotPropertyValue, PropertyAccess, SimplifiedMiotSpec } from '../models/index.js';

/**
 * Maps a raw MiotSpec (global layer) into a SimplifiedMiotSpec (v1 layer).
 * MiotSpec → SimplifiedMiotSpec (parsed, indexed domain model)
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class SimplifiedMiotSpecV2Mapper extends MappingUtils {
    async map(data: MiotSpec): Promise<SimplifiedMiotSpec> {
        const properties = new Map<string, MiotProperty>();
        const actions = new Map<string, MiotAction>();

        const validServices = data.services.slice(1).filter(
            svc => svc.type.split(':')[1] === 'miot-spec-v2'
        );

        await this.mapArray(validServices, async (svc) => {
            const serviceKey = svc.type.split(':')[3];

            await this.mapOptionalArray(
                svc.properties?.filter(p => p.access.length),
                async (p) => {
                    const values = await this.mapOptionalArray(p.valueList, async (v) =>
                        CommonUtils.buildModel(MiotPropertyValue, {
                            value: v.value,
                            description: v.description
                        })
                    );

                    properties.set(`${serviceKey}:${p.type.split(':')[3]}`, CommonUtils.buildModel(MiotProperty, {
                        siid: svc.iid,
                        piid: p.iid,
                        access: p.access.map(a => a as unknown as PropertyAccess),
                        values: values ?? []
                    }));
                }
            );

            await this.mapOptionalArray(svc.actions, async (a) => {
                actions.set(`${serviceKey}:${a.type.split(':')[3]}`, CommonUtils.buildModel(MiotAction, {
                    siid: svc.iid,
                    aiid: a.iid,
                    in: a.in
                }));
            });
        });

        return CommonUtils.buildModel(SimplifiedMiotSpec, {
            name: data.description,
            type: data.type,
            properties,
            actions
        });
    }
}
