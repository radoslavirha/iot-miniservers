import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils } from '@radoslavirha/utils';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';
import { ModelPropertyOverride } from '../../models/model-property-override/ModelPropertyOverride.js';
import { ModelPropertyOverrideRequest } from '../../models/model-property-override/ModelPropertyOverrideRequest.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideCreateHandler {
    constructor(private readonly modelPropertyOverrideService: ModelPropertyOverrideService) {}

    public async execute(request: ModelPropertyOverrideRequest): Promise<ModelPropertyOverride> {
        // TODO: Fetch real spec and validate
        // - cannot create duplicate override for same model/siid/piid combination, only not existing property override can be created
        // TODO: Fetch overrides from storage
        // - validate that key is unique for the model (e.g. cannot have two overrides with same key for the same model, but can have same key for different models)
        return this.modelPropertyOverrideService.create(
            CommonUtils.buildModelCore(ModelPropertyOverride, {
                model: request.model,
                key: request.key,
                siid: request.siid,
                piid: request.piid,
                access: request.access,
                values: request.values
            })
        );
    }
}
