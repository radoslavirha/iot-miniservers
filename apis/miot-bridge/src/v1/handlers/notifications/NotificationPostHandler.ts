import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceNotificationCache } from '../../../global/models/DeviceNotificationCache.js';
import { DeviceStorageService } from '../../../global/services/DeviceStorageService.js';
import { DevicePropertyPollerService } from '../../../global/services/DevicePropertyPollerService.js';
import { NotificationStorageService } from '../../../global/services/NotificationStorageService.js';
import { SimplifiedMiotSpecV2Mapper } from '../../../global/mappers/SimplifiedMiotSpecV2Mapper.js';
import { NotificationV1Mapper } from '../../mappers/NotificationV1Mapper.js';
import { NotificationRequest } from '../../models/notifications/NotificationRequest.js';
import { DeviceNotificationsResponse } from '../../models/notifications/DeviceNotificationsResponse.js';
import { PropertyAccess } from '../../../global/models/simplified-miot-spec/PropertyAccess.enum.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationPostHandler {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly notificationStorageService: NotificationStorageService,
        private readonly devicePropertyPollerService: DevicePropertyPollerService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly notificationV1Mapper: NotificationV1Mapper
    ) {}

    async execute(deviceId: string, request: NotificationRequest): Promise<DeviceNotificationsResponse> {
        const device = await this.deviceStorageService.getById(deviceId);
        if (!device) {
            throw new NotFound(`Device ${deviceId} not found.`);
        }

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);

        for (const propertyKey of request.properties) {
            const prop = spec.properties.get(propertyKey);
            if (!prop) {
                throw new BadRequest(`Property '${propertyKey}' not found in spec for device ${deviceId}.`);
            }
            if (!prop.access.includes(PropertyAccess.Read) && !prop.access.includes(PropertyAccess.Write)) {
                throw new BadRequest(`Property '${propertyKey}' does not have READ or WRITE access and cannot be subscribed.`);
            }
        }

        const created: DeviceNotificationCache[] = [];
        for (const property of request.properties) {
            const notification = await this.notificationStorageService.create(
                CommonUtils.buildModel(DeviceNotificationCache, { deviceId, property })
            );
            created.push(notification);
        }

        this.devicePropertyPollerService.addSubscriptions(deviceId, request.properties);

        return CommonUtils.buildModel(DeviceNotificationsResponse, {
            notifications: created.map(n => this.notificationV1Mapper.mapCacheToNotification(n))
        });
    }
}
