import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceStorageService } from '../../services/DeviceStorageService.js';
import { DevicePropertyPollerService } from '../../services/DevicePropertyPollerService.js';
import { NotificationStorageService } from '../../services/NotificationStorageService.js';
import { ModelPropertyOverrideService } from '../../services/ModelPropertyOverrideService.js';
import { SimplifiedMiotSpecV2Mapper } from '../../mappers/SimplifiedMiotSpecV2Mapper.js';
import { NotificationMapper } from '../../mappers/NotificationMapper.js';
import { NotificationRequest } from '../../models/notifications/NotificationRequest.js';
import { DeviceNotification } from '../../models/notifications/DeviceNotification.js';
import { DeviceNotificationsResponse } from '../../models/notifications/DeviceNotificationsResponse.js';
import { PropertyAccess } from '../../models/simplified-miot-spec/PropertyAccess.enum.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationPostHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly notificationStorageService: NotificationStorageService,
        private readonly devicePropertyPollerService: DevicePropertyPollerService,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly notificationMapper: NotificationMapper
    ) {}

    async execute(deviceId: string, request: NotificationRequest): Promise<DeviceNotificationsResponse> {
        const device = await this.deviceStorageService.getById(deviceId);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${deviceId} not found.`);
        }

        const overrides = await this.modelPropertyOverrideService.getByModel(device.model);
        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec, overrides);

        for (const propertyKey of request.properties) {
            const prop = spec.properties.get(propertyKey);
            if (CommonUtils.isNil(prop)) {
                throw new BadRequest(`Property '${propertyKey}' not found in spec for device ${deviceId}.`);
            }
            if (!prop.access.includes(PropertyAccess.Read) && !prop.access.includes(PropertyAccess.Write)) {
                throw new BadRequest(`Property '${propertyKey}' does not have READ or WRITE access and cannot be subscribed.`);
            }
        }

        const created: DeviceNotification[] = [];
        for (const property of request.properties) {
            const notification = await this.notificationStorageService.create(CommonUtils.buildModelCore(DeviceNotification, { deviceId, property }));
            created.push(notification);
        }

        this.devicePropertyPollerService.addSubscriptions(deviceId, request.properties);

        return CommonUtils.buildModelStrict(DeviceNotificationsResponse, {
            notifications: created.map(n => this.notificationMapper.mapCacheToNotification(n))
        });
    }
}
