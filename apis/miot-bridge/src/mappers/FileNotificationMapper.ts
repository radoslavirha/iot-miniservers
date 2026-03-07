import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, MappingUtils } from '@radoslavirha/utils';
import { DeviceNotificationCache } from '../models/DeviceNotificationCache.js';
import { NotificationLocalStorageDTO } from '../storage/notification-local-storage/dto/NotificationLocalStorageDTO.js';

@Injectable()
@Scope(ProviderScope.SINGLETON)
export class FileNotificationMapper extends MappingUtils {
    public async mapDTOToModel(dto: NotificationLocalStorageDTO): Promise<DeviceNotificationCache> {
        return Promise.resolve(CommonUtils.buildModel(DeviceNotificationCache, {
            id: dto.id,
            deviceId: dto.deviceId,
            property: dto.property
        }));
    }

    public async mapModelToDTO(entity: Omit<DeviceNotificationCache, 'id'>): Promise<Omit<NotificationLocalStorageDTO, 'id'>> {
        return Promise.resolve(CommonUtils.buildModel(NotificationLocalStorageDTO, {
            deviceId: entity.deviceId,
            property: entity.property
        }));
    }
}
