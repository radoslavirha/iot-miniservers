import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MiotSpecV2, MiotSpecV2PropertyAccess } from '../models/miot-spec-v2/index.js';
import { MiotAction, MiotProperty, MiotPropertyValue, PropertyAccess, SimplifiedMiotSpec } from '../models/simplified-miot-spec/index.js';
import type { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE, MIOT_PROPERTY_SOURCE_VALUE_SPEC } from '../otel/telemetry.js';

/**
 * Maps a raw MiotSpec (global layer) into a SimplifiedMiotSpec (global layer).
 * MiotSpec → SimplifiedMiotSpec (parsed, indexed domain model)
 *
 * ### Provenance
 *
 * This is the only place that can honestly say where a property came from. The published spec is
 * mapped first and the overrides are applied on top with a plain `set()`, so an override that
 * reuses a published key **replaces** it — and after the merge the map holds no trace of which
 * happened. Every property therefore carries `MiotProperty.source`, decided here at the point of
 * insertion, because the device's spec is incomplete and "did the device refuse an entry we added
 * ourselves" is a question that cannot be answered from the merged map afterwards.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class SimplifiedMiotSpecV2Mapper extends MappingUtils {
    async map(data: MiotSpecV2, overrides: ModelPropertyOverride[] = []): Promise<SimplifiedMiotSpec> {
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
                        source: MIOT_PROPERTY_SOURCE_VALUE_SPEC,
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

        for (const override of overrides) {
            const svc = data.services.find(s => s.iid === override.siid);
            if (CommonUtils.isNil(svc)) {
                continue;
            }
            const serviceKey = svc.type.split(':')[3];
            // `set`, not a merge: an override that reuses a published key wins outright, and from
            // here on the entry is ours — which is exactly what a refusal of it would be blaming.
            properties.set(`${serviceKey}:${override.key}`, CommonUtils.buildModelStrict(MiotProperty, {
                source: MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE,
                siid: override.siid,
                piid: override.piid,
                access: override.access,
                values: override.values.map(v =>
                    CommonUtils.buildModelStrict(MiotPropertyValue, { value: v.value, description: v.description })
                )
            }));
        }

        return CommonUtils.buildModelStrict(SimplifiedMiotSpec, {
            name: data.description,
            type: data.type,
            properties,
            actions
        });
    }
}
