import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { DeviceRequestModel } from '../models/DeviceRequestModel.js';
import { DeviceResponseModel } from '../models/DeviceResponseModel.js';
import { DeviceRegistrationService } from '../services/DeviceRegistrationService.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class DeviceRegisterHandler {
    constructor(private readonly registrationService: DeviceRegistrationService) {}

    execute(request: DeviceRequestModel): Promise<DeviceResponseModel> {
        return this.registrationService.persist(request);
    }
}
