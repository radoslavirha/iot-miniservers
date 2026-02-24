import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MiotSpecV2DTO } from '../endpoints/miot-spec-v2/dto/MiotSpecV2DTO.js';
import { MiotSpecV2PropertyAccessDTO, MiotSpecV2PropertyFormatDTO } from '../endpoints/miot-spec-v2/dto/index.js';
import {
    MiotSpecV2,
    MiotSpecV2Service,
    MiotSpecV2ServiceAction,
    MiotSpecV2ServiceEvent,
    MiotSpecV2ServiceProperty,
    MiotSpecV2PropertyValue,
    MiotSpecV2PropertyAccess,
    MiotSpecV2PropertyFormat
} from '../models/miio-spec-v2/index.js';

/**
 * Mapper for the MIoT spec layer.
 * - mapDTOToModel: MiotSpecV2DTO → MiotSpecV2 (1:1 raw domain model)
 *
 * For MiotSpecV2 → SimplifiedMiotSpec, see v1/mappers/SimplifiedMiotSpecV2Mapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecV2Mapper extends MappingUtils {
    async mapDTOToModel(dto: MiotSpecV2DTO): Promise<MiotSpecV2> {
        return CommonUtils.buildModel(MiotSpecV2, {
            type: dto.type,
            description: dto.description,
            services: await this.mapArray(dto.services, async (svc) =>
                CommonUtils.buildModel(MiotSpecV2Service, {
                    iid: svc.iid,
                    type: svc.type,
                    description: svc.description,
                    properties: await this.mapOptionalArray(svc.properties, async (p) =>
                        CommonUtils.buildModel(MiotSpecV2ServiceProperty, {
                            iid: p.iid,
                            type: p.type,
                            description: p.description,
                            format: this.mapEnum({ MiotSpecV2PropertyFormatDTO }, { MiotSpecV2PropertyFormat }, p.format),
                            access: await this.mapArray(p.access, async (a) =>
                                this.mapEnum({ MiotSpecV2PropertyAccessDTO }, { MiotSpecV2PropertyAccess }, a)
                            ),
                            unit: p.unit,
                            valueList: await this.mapOptionalArray(p.valueList, async (v) =>
                                CommonUtils.buildModel(MiotSpecV2PropertyValue, {
                                    value: v.value,
                                    description: v.description
                                })
                            ),
                            valueRange: p.valueRange,
                            gattAccess: p.gattAccess
                        })
                    ),
                    actions: await this.mapOptionalArray(svc.actions, async (a) =>
                        CommonUtils.buildModel(MiotSpecV2ServiceAction, {
                            iid: a.iid,
                            type: a.type,
                            description: a.description,
                            in: a.in,
                            out: a.out
                        })
                    ),
                    events: await this.mapOptionalArray(svc.events, async (e) =>
                        CommonUtils.buildModel(MiotSpecV2ServiceEvent, {
                            iid: e.iid,
                            type: e.type,
                            description: e.description,
                            arguments: e.arguments
                        })
                    )
                })
            )
        });
    }

}


