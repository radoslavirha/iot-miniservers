import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideLocalStorageDTO } from '../storage/model-property-override/dto/ModelPropertyOverrideLocalStorageDTO.js';
import { ModelPropertyOverrideAccessDTO } from '../storage/model-property-override/dto/ModelPropertyOverrideAccessDTO.enum.js';
import { MiotPropertyValue } from '../models/simplified-miot-spec/MiotPropertyValue.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';

/**
 * Maps ModelPropertyOverrideLocalStorageDTO ↔ ModelPropertyOverride.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideMapper extends MappingUtils {
    public async mapDTOToModel(dto: ModelPropertyOverrideLocalStorageDTO): Promise<ModelPropertyOverride> {
        return CommonUtils.buildModelStrict(ModelPropertyOverride, {
            id: dto.id,
            model: dto.model,
            key: dto.key,
            siid: dto.siid,
            piid: dto.piid,
            access: await this.mapArray(dto.access, async (value) => await this.mapEnum({ ModelPropertyOverrideAccessDTO }, { PropertyAccess }, value)),
            values: dto.values.map(v =>
                CommonUtils.buildModelStrict(MiotPropertyValue, { value: v.value, description: v.description })
            ),
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt
        });
    }

    public async mapModelToCreateDTO(
        model: Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<Omit<ModelPropertyOverrideLocalStorageDTO, 'id' | 'createdAt' | 'updatedAt'>> {
        return CommonUtils.buildModelCore(ModelPropertyOverrideLocalStorageDTO, {
            model: model.model,
            key: model.key,
            siid: model.siid,
            piid: model.piid,
            access: await this.mapArray(model.access, async (value) => await this.mapEnum({ PropertyAccess }, { ModelPropertyOverrideAccessDTO }, value)),
            values: model.values.map(v => ({ value: v.value, description: v.description }))
        });
    }
}
