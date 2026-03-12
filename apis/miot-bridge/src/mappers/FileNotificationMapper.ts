import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceNotification } from '../models/notifications/DeviceNotification.js';
import { NotificationLocalStorageDTO } from '../storage/notification-local-storage/dto/NotificationLocalStorageDTO.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileNotificationMapper extends MappingUtils {
    public mapDTOToModel(dto: NotificationLocalStorageDTO): DeviceNotification {
        return CommonUtils.buildModelStrict(DeviceNotification, {
            id: dto.id,
            deviceId: dto.deviceId,
            property: dto.property,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt
        });
    }

    public mapModelToDTO(entity: Omit<DeviceNotification, 'id' | 'createdAt' | 'updatedAt'>): Omit<NotificationLocalStorageDTO, 'id' | 'createdAt' | 'updatedAt'> {
        return CommonUtils.buildModelCore(NotificationLocalStorageDTO, { deviceId: entity.deviceId, property: entity.property });
    }
}
