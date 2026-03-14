import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideDeleteHandler {
    constructor(private readonly modelPropertyOverrideService: ModelPropertyOverrideService) {}

    public async execute(id: string): Promise<void> {
        const all = await this.modelPropertyOverrideService.getAll();
        if (CommonUtils.isNil(all.find(o => o.id === id))) {
            throw new NotFound(`Model property override ${id} not found.`);
        }
        await this.modelPropertyOverrideService.delete(id);
    }
}
