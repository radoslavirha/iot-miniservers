import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { NotFound } from '@tsed/exceptions';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceDeleteHandler {
    constructor(private readonly deviceStorageService: DeviceStorageService) {}

    async execute(id: string): Promise<void> {
        const device = await this.deviceStorageService.getById(id);
        if (!device) {
            throw new NotFound(`Device ${id} not found.`);
        }
        await this.deviceStorageService.delete(id);
    }
}
