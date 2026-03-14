import { AdditionalProperties, CollectionOf, Description, Required } from '@tsed/schema';
import { ModelPropertyOverride } from './ModelPropertyOverride.js';

@Description('Response model containing a list of model property overrides.')
@AdditionalProperties(false)
export class ModelPropertyOverridesResponse {
    @Required()
    @CollectionOf(ModelPropertyOverride)
    public overrides: ModelPropertyOverride[];
}
