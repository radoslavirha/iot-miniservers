import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { MiotSpecDTO } from './model/dto/MiotSpecDTO.js';
import { PropertyAccessDTO, PropertyFormatDTO } from './model/dto/index.js';
import {
    MiotSpec,
    MiotSpecService,
    MiotSpecServiceAction,
    MiotSpecServiceProperty,
    MiotSpecPropertyValue,
    PropertyAccess,
    PropertyFormat
} from './model/domain/index.js';

/**
 * Mapper for the MIoT spec layer.
 * - mapDTOToModel: MiotSpecDTO → MiotSpec (1:1 raw domain model)
 *
 * For MiotSpec → SimplifiedMiotSpec, see v1/mappers/SimplifiedMiotSpecV2Mapper.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MiotSpecV2Mapper extends MappingUtils {
    async mapDTOToModel(dto: MiotSpecDTO): Promise<MiotSpec> {
        return CommonUtils.buildModel(MiotSpec, {
            type: dto.type,
            description: dto.description,
            services: await this.mapArray(dto.services, async (svc) =>
                CommonUtils.buildModel(MiotSpecService, {
                    iid: svc.iid,
                    type: svc.type,
                    description: svc.description,
                    properties: await this.mapOptionalArray(svc.properties, async (p) =>
                        CommonUtils.buildModel(MiotSpecServiceProperty, {
                            iid: p.iid,
                            type: p.type,
                            description: p.description,
                            format: this.mapEnum({ PropertyFormatDTO }, { PropertyFormat }, p.format),
                            access: await this.mapArray(p.access, async (a) =>
                                this.mapEnum({ PropertyAccessDTO }, { PropertyAccess }, a)
                            ),
                            unit: p.unit,
                            valueList: await this.mapOptionalArray(p.valueList, async (v) =>
                                CommonUtils.buildModel(MiotSpecPropertyValue, {
                                    value: v.value,
                                    description: v.description
                                })
                            ),
                            valueRange: p.valueRange
                        })
                    ),
                    actions: await this.mapOptionalArray(svc.actions, async (a) =>
                        CommonUtils.buildModel(MiotSpecServiceAction, {
                            iid: a.iid,
                            type: a.type,
                            description: a.description,
                            in: a.in,
                            out: a.out
                        })
                    )
                })
            )
        });
    }

}


