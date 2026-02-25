import { Service, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { DeviceCache } from '../../global/models/DeviceCache.js';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MiotProperty } from '../models/simplified-miot-spec/MiotProperty.js';
import { MiotAction } from '../models/simplified-miot-spec/MiotAction.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { MiotLocalService } from './MiotLocalService.js';

/**
 * Routes a transport-agnostic CommandRequest to the correct miot device call.
 * Validates the requested operation against the device's MIoT spec.
 * On failure, performs a fresh handshake to recover the current stamp and retries once.
 * Updates the cached stamp after each successful call.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class CommandRoutingService {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly miotLocalService: MiotLocalService
    ) {}

    async execute(request: DeviceCommandRequest): Promise<CommandResponseModel> {
        const device = await this.deviceStorageService.getById(request.deviceId);
        if (!device) {
            throw new NotFound(`Device ${request.deviceId} not found in cache. Register the device first.`);
        }

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);

        // Validate operation and resolve spec entry — throw immediately, no retry for user errors
        let property: MiotProperty | undefined;
        let action: MiotAction | undefined;

        if (request.operation === DeviceCommandOperation.GetProperty || request.operation === DeviceCommandOperation.SetProperty) {
            property = spec.properties.get(request.command);
            if (!property) {
                throw new BadRequest(`Property '${request.command}' not found in spec for device ${request.deviceId}.`);
            }
            if (request.operation === DeviceCommandOperation.GetProperty) {
                // if (!property.access.includes(PropertyAccess.Read) && !property.access.includes(PropertyAccess.Notify)) {
                //     throw new BadRequest(`Property '${request.command}' does not have read or notify access.`);
                // }
            } else {
                if (!property.access.includes(PropertyAccess.Write)) {
                    throw new BadRequest(`Property '${request.command}' does not have write access.`);
                }
                // Validate the value is one of the allowed values
                this.validatePropertyValue(request.command, request.value, property);
            }
        } else {
            action = spec.actions.get(request.command);
            if (!action) {
                throw new BadRequest(`Action '${request.command}' not found in spec for device ${request.deviceId}.`);
            }
        }

        // First attempt using the cached stamp + 1
        let stamp = device.stamp + 1;
        let value: unknown;

        try {
            value = await this.dispatch(request, device, stamp, property, action);
        } catch {
            // Stamp is stale or device is unreachable — perform handshake to recover current stamp and retry once
            const { stamp: freshStamp } = await this.miotLocalService.handshake(device.address);
            stamp = freshStamp + 1;
            value = await this.dispatch(request, device, stamp, property, action);
        }
        console.log('execute', value);

        // Persist the new stamp so the next command is accepted by the device
        await this.deviceStorageService.upsert(CommonUtils.buildModel(DeviceCache, {
            deviceId: device.deviceId,
            address: device.address,
            token: device.token,
            stamp,
            model: device.model,
            specURL: device.specURL,
            rawSpec: device.rawSpec
        }));

        return CommonUtils.buildModel(CommandResponseModel, {
            deviceId: request.deviceId,
            command: request.command,
            operation: request.operation,
            success: true,
            value
        });
    }

    // ─── Private ─────────────────────────────────────────────

    private validatePropertyValue(command: string, value: unknown, property: MiotProperty): void {
        // Check if the value is in the allowed list (strict equality: 4 !== "4")
        const isValid = property.values.some(allowedVal => allowedVal.value === value);
        if (!isValid) {
            const allowed = property.values.map(v => `${v.value} (${v.description})`).join(', ');
            throw new BadRequest(
                `Property '${command}' value ${JSON.stringify(value)} is not allowed. ` +
                `Allowed values: ${allowed}`
            );
        }
    }

    private async dispatch(
        request: DeviceCommandRequest,
        device: DeviceCache,
        stamp: number,
        property: MiotProperty | undefined,
        action: MiotAction | undefined
    ): Promise<unknown> {
        if (request.operation === DeviceCommandOperation.GetProperty && property) {
            return this.miotLocalService.getProperty(
                device.address, device.token, device.deviceId, stamp,
                property.siid, property.piid
            );
        }

        if (request.operation === DeviceCommandOperation.SetProperty && property) {
            return this.miotLocalService.setProperty(
                device.address, device.token, device.deviceId, stamp,
                property.siid, property.piid, request.value
            );
        }

        if (action) {
            return this.miotLocalService.callAction(
                device.address, device.token, device.deviceId, stamp,
                action.siid, action.aiid, request.value
            );
        }
    }
}
