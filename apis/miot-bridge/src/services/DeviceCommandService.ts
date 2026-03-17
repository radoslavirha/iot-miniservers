import { Service, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { RawCommandRequest } from '../models/RawCommandRequest.js';
import { DeviceStorageService } from './DeviceStorageService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { type SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MiotProperty } from '../models/simplified-miot-spec/MiotProperty.js';
import { MiotAction } from '../models/simplified-miot-spec/MiotAction.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { NotificationDispatchService } from './NotificationDispatchService.js';
import { ModelPropertyOverrideService } from './ModelPropertyOverrideService.js';
import { MiotDeviceRegistry } from './MiotDeviceRegistry.js';
import type { GetPropertiesResult } from '@radoslavirha/miot-device';

/** Per-key result returned by {@link DeviceCommandService.getProperties}. */
export type KeyedPropertyResult = GetPropertiesResult & { key: string };

/** Bulk result returned by {@link DeviceCommandService.getProperties}. */
export type GetPropertiesResponse = { miotDeviceId: number; results: KeyedPropertyResult[] };

/** Strongly-typed discriminated union of a validated, spec-resolved command. */
type ResolvedCommand =
    | { operation: DeviceCommandOperation.GetProperty; property: MiotProperty }
    | { operation: DeviceCommandOperation.SetProperty; property: MiotProperty }
    | { operation: DeviceCommandOperation.Action; action: MiotAction };

/**
 * Validates and dispatches MIoT commands against registered devices.
 * Transport, stamp management, and retry logic are delegated entirely to
 * {@link MiotDeviceRegistry} / {@link MiotDevice}.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceCommandService {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly notificationDispatch: NotificationDispatchService,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService,
        private readonly registry: MiotDeviceRegistry
    ) {}

    /**
     * Bulk-reads a set of spec property keys for a device identified by its storage ID.
     * Unresolvable keys are silently omitted from the result.
     */
    async getProperties(storageId: string, keys: string[]): Promise<GetPropertiesResponse> {
        const device = await this.deviceStorageService.getById(storageId);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${storageId} not found.`);
        }

        const overrides = await this.modelPropertyOverrideService.getByModel(device.model);
        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec, overrides);
        const props: Array<{ key: string; siid: number; piid: number }> = [];
        for (const key of keys) {
            const property = spec.properties.get(key);
            if (property) props.push({ key, siid: property.siid, piid: property.piid });
        }
        if (!props.length) return { miotDeviceId: device.deviceId, results: [] };

        const miotDevice = this.registry.getOrCreate(device);
        const rawResults = await miotDevice.getProperties(props.map(p => ({ siid: p.siid, piid: p.piid })));

        const results = props.map(p => {
            const r = rawResults.find(x => x.siid === p.siid && x.piid === p.piid);
            return { key: p.key, siid: p.siid, piid: p.piid, value: r?.value, code: r?.code ?? -1 };
        });

        return { miotDeviceId: device.deviceId, results };
    }

    /**
     * Executes a raw IID command against a registered device, bypassing spec lookup.
     */
    async executeRaw(request: RawCommandRequest): Promise<CommandResponseModel> {
        const device = await this.deviceStorageService.getByDeviceId(request.deviceId);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${request.deviceId} not found in cache. Register the device first.`);
        }

        if (
            (request.operation === DeviceCommandOperation.GetProperty || request.operation === DeviceCommandOperation.SetProperty) &&
            CommonUtils.isNil(request.piid)
        ) {
            throw new BadRequest(`piid is required for ${request.operation} operations.`);
        }

        if (request.operation === DeviceCommandOperation.Action && CommonUtils.isNil(request.aiid)) {
            throw new BadRequest(`aiid is required for ${DeviceCommandOperation.Action} operations.`);
        }

        const miotDevice = this.registry.getOrCreate(device);
        let value: string | number | undefined;

        switch (request.operation) {
            case DeviceCommandOperation.GetProperty:
                value = await miotDevice.getProperty(request.siid, request.piid!);
                break;
            case DeviceCommandOperation.SetProperty:
                await miotDevice.setProperty(request.siid, request.piid!, request.value as string | number);
                break;
            case DeviceCommandOperation.Action:
                await miotDevice.callAction(request.siid, request.aiid!, request.value);
                break;
            default:
                throw new BadRequest(`Unsupported operation: ${request.operation as string}.`);
        }

        return CommonUtils.buildModelStrict(CommandResponseModel, {
            deviceId: request.deviceId,
            command: `siid=${request.siid},piid=${request.piid ?? request.aiid}`,
            operation: request.operation,
            success: true,
            value
        });
    }

    async execute(request: DeviceCommandRequest): Promise<CommandResponseModel> {
        const device = await this.deviceStorageService.getByDeviceId(request.deviceId);
        if (CommonUtils.isNil(device)) {
            throw new NotFound(`Device ${request.deviceId} not found in cache. Register the device first.`);
        }

        const overrides = await this.modelPropertyOverrideService.getByModel(device.model);
        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec, overrides);
        const resolved = this.resolveCommand(request, device.deviceId, spec);

        const miotDevice = this.registry.getOrCreate(device);
        let value: string | number | undefined;

        switch (resolved.operation) {
            case DeviceCommandOperation.GetProperty:
                value = await miotDevice.getProperty(resolved.property.siid, resolved.property.piid);
                this.notificationDispatch.receive({
                    deviceId: device.id,
                    miotDeviceId: device.deviceId,
                    property: request.command,
                    oldValue: undefined,
                    newValue: value,
                    timestamp: Date.now()
                });
                break;
            case DeviceCommandOperation.SetProperty:
                await miotDevice.setProperty(resolved.property.siid, resolved.property.piid, request.value as string | number);
                this.notificationDispatch.receive({
                    deviceId: device.id,
                    miotDeviceId: device.deviceId,
                    property: request.command,
                    oldValue: undefined,
                    newValue: request.value,
                    timestamp: Date.now()
                });
                break;
            case DeviceCommandOperation.Action:
                await miotDevice.callAction(resolved.action.siid, resolved.action.aiid, request.value);
                break;
        }

        return CommonUtils.buildModelStrict(CommandResponseModel, {
            deviceId: request.deviceId,
            command: request.command,
            operation: request.operation,
            success: true,
            value
        });
    }

    /**
     * Validates the request against the MIoT spec and returns a typed
     * {@link ResolvedCommand}. Throws {@link BadRequest} for any spec violation.
     */
    private resolveCommand(request: DeviceCommandRequest, deviceId: number, spec: SimplifiedMiotSpec): ResolvedCommand {
        if (request.operation === DeviceCommandOperation.GetProperty) {
            const property = spec.properties.get(request.command);
            if (CommonUtils.isNil(property)) {
                throw new BadRequest(`Property '${request.command}' not found in spec for device ${deviceId}.`);
            }
            if (!property.access.includes(PropertyAccess.Read) && !property.access.includes(PropertyAccess.Notify)) {
                throw new BadRequest(`Property '${request.command}' does not support read or notify access.`);
            }
            return { operation: DeviceCommandOperation.GetProperty, property };
        }

        if (request.operation === DeviceCommandOperation.SetProperty) {
            const property = spec.properties.get(request.command);
            if (CommonUtils.isNil(property)) {
                throw new BadRequest(`Property '${request.command}' not found in spec for device ${deviceId}.`);
            }
            if (!property.access.includes(PropertyAccess.Write)) {
                throw new BadRequest(`Property '${request.command}' does not support write access.`);
            }
            this.validatePropertyValue(request.command, request.value, property);
            return { operation: DeviceCommandOperation.SetProperty, property };
        }

        if (request.operation === DeviceCommandOperation.Action) {
            const action = spec.actions.get(request.command);
            if (CommonUtils.isNil(action)) {
                throw new BadRequest(`Action '${request.command}' not found in spec for device ${deviceId}.`);
            }
            return { operation: DeviceCommandOperation.Action, action };
        }

        throw new BadRequest(`Unsupported operation: ${request.operation as string}.`);
    }

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
}
