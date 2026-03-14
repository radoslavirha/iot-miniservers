import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';
import { ModelPropertyOverride } from '../../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverridesResponse } from '../../models/model-property-override/ModelPropertyOverridesResponse.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideGetAllHandler {
    constructor(private readonly modelPropertyOverrideService: ModelPropertyOverrideService) {}

    public async execute(model?: string): Promise<ModelPropertyOverridesResponse> {
        const overrides: ModelPropertyOverride[] = model
            ? await this.modelPropertyOverrideService.getByModel(model)
            : await this.modelPropertyOverrideService.getAll();

        return CommonUtils.buildModelStrict(ModelPropertyOverridesResponse, { overrides });
    }
}
