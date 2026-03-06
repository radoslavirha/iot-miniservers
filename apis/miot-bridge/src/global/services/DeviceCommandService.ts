import { Service, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { DeviceCache } from '../models/DeviceCache.js';
import { DeviceStorageService } from './DeviceStorageService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { type SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MiotProperty } from '../models/simplified-miot-spec/MiotProperty.js';
import { MiotAction } from '../models/simplified-miot-spec/MiotAction.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { MiotDeviceClient, type GetPropertiesResult } from './MiotDeviceClient.js';
import { NotificationDispatchService } from './NotificationDispatchService.js';

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
 * Maximum age (ms) of a cached stamp before it is considered stale.
 * Xiaomi devices silently drop commands with stale stamps, causing a 10-second
 * timeout on the first dispatch attempt. Proactively handshaking when the stamp
 * is known to be old avoids this penalty entirely.
 */
const STAMP_MAX_AGE_MS = 30_000;

/**
 * Executes a transport-agnostic command against a registered device.
 * Validates the requested operation against the device's MIoT spec.
 * On failure, performs a fresh handshake to recover the current stamp and retries once.
 * Updates the cached stamp after each successful call.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class DeviceCommandService {
    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly miotDeviceClient: MiotDeviceClient,
        private readonly notificationDispatch: NotificationDispatchService
    ) {}

    /**
     * Bulk-reads a set of spec property keys for a device identified by its storage ID.
     * Uses the same stamp-refresh + retry logic as {@link execute}.
     * Unresolvable keys are silently omitted from the result.
     */
    async getProperties(storageId: string, keys: string[]): Promise<GetPropertiesResponse> {
        const device = await this.deviceStorageService.getById(storageId);
        if (!device) throw new NotFound(`Device ${storageId} not found.`);

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);
        const props: Array<{ key: string; siid: number; piid: number }> = [];
        for (const key of keys) {
            const property = spec.properties.get(key);
            if (property) props.push({ key, siid: property.siid, piid: property.piid });
        }
        if (!props.length) return { miotDeviceId: device.deviceId, results: [] };

        const coords = props.map(p => ({ siid: p.siid, piid: p.piid }));
        const rawResults = await this.runWithStamp(
            device,
            stamp => this.miotDeviceClient.getProperties(device.address, device.token, device.deviceId, stamp, coords)
                .then(r => r.results)
        );

        const results = props.map(p => {
            const r = rawResults.find(x => x.siid === p.siid && x.piid === p.piid);
            return { key: p.key, siid: p.siid, piid: p.piid, value: r?.value, code: r?.code ?? -1 };
        });

        return { miotDeviceId: device.deviceId, results };
    }

    async execute(request: DeviceCommandRequest): Promise<CommandResponseModel> {
        const device = await this.deviceStorageService.getByDeviceId(request.deviceId);
        if (!device) {
            throw new NotFound(`Device ${request.deviceId} not found in cache. Register the device first.`);
        }

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);
        const resolved = this.resolveCommand(request, device.deviceId, spec);

        const value = await this.runWithStamp(
            device,
            stamp => this.dispatch(request, device, stamp, resolved)
        );

        if (resolved.operation === DeviceCommandOperation.GetProperty) {
            this.notificationDispatch.receive({
                deviceId: device.id,
                miotDeviceId: device.deviceId,
                property: request.command,
                oldValue: undefined,
                newValue: value,
                timestamp: Date.now()
            });
        } else if (resolved.operation === DeviceCommandOperation.SetProperty) {
            this.notificationDispatch.receive({
                deviceId: device.id,
                miotDeviceId: device.deviceId,
                property: request.command,
                oldValue: undefined, // We don't have the old value here, but it could be fetched if needed
                newValue: request.value,
                timestamp: Date.now()
            });
        }

        return CommonUtils.buildModel(CommandResponseModel, {
            deviceId: request.deviceId,
            command: request.command,
            operation: request.operation,
            success: true,
            value
        });
    }

    // ─── Private ─────────────────────────────────────────────

    /**
     * Runs `fn` with stamp-refresh retry, then persists the updated stamp.
     * Single source of truth for the stamp management cycle used by every public method.
     */
    private async runWithStamp<T>(device: DeviceCache, fn: (stamp: number) => Promise<T>): Promise<T> {
        const { result, stamp, stampUpdatedAt } = await this.withStampRefresh(device, fn);
        await this.deviceStorageService.upsert(
            CommonUtils.buildModel(DeviceCache, { ...device, stamp, stampUpdatedAt })
        );
        return result;
    }

    /**
     * Generic stamp-refresh wrapper.
     * If the cached stamp is older than {@link STAMP_MAX_AGE_MS}, performs a proactive
     * handshake first. For fresh stamps: try with cached stamp, on failure handshake once
     * and retry. Throws with context if the retry also fails.
     */
    private async withStampRefresh<T>(
        device: DeviceCache,
        fn: (stamp: number) => Promise<T>
    ): Promise<{ result: T; stamp: number; stampUpdatedAt: number }> {
        const stampAge = Date.now() - (device.stampUpdatedAt ?? 0);

        if (stampAge > STAMP_MAX_AGE_MS) {
            const { stamp: freshStamp } = await this.miotDeviceClient.handshake(device.address);
            const stamp = freshStamp + 1;
            return { result: await fn(stamp), stamp, stampUpdatedAt: Date.now() };
        }

        try {
            const stamp = device.stamp + 1;
            return { result: await fn(stamp), stamp, stampUpdatedAt: Date.now() };
        } catch {
            // Stamp turned stale mid-session — handshake and retry once
        }

        const { stamp: freshStamp } = await this.miotDeviceClient.handshake(device.address);
        const stamp = freshStamp + 1;
        try {
            return { result: await fn(stamp), stamp, stampUpdatedAt: Date.now() };
        } catch (retryError) {
            const reason = retryError instanceof Error ? retryError.message : String(retryError);
            throw new Error(`Operation failed after stamp refresh for device ${device.deviceId}: ${reason}`);
        }
    }

    /**
     * Validates the request against the MIoT spec and returns a typed
     * {@link ResolvedCommand}. Throws {@link BadRequest} for any spec violation.
     */
    private resolveCommand(request: DeviceCommandRequest, deviceId: number, spec: SimplifiedMiotSpec): ResolvedCommand {
        if (request.operation === DeviceCommandOperation.GetProperty) {
            const property = spec.properties.get(request.command);
            if (!property) {
                throw new BadRequest(`Property '${request.command}' not found in spec for device ${deviceId}.`);
            }
            if (!property.access.includes(PropertyAccess.Read) && !property.access.includes(PropertyAccess.Notify)) {
                throw new BadRequest(`Property '${request.command}' does not support read or notify access.`);
            }
            return { operation: DeviceCommandOperation.GetProperty, property };
        }

        if (request.operation === DeviceCommandOperation.SetProperty) {
            const property = spec.properties.get(request.command);
            if (!property) {
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
            if (!action) {
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

    private async dispatch(
        request: DeviceCommandRequest,
        device: DeviceCache,
        stamp: number,
        resolved: ResolvedCommand
    ): Promise<unknown> {
        const { address, token, deviceId } = device;

        switch (resolved.operation) {
            case DeviceCommandOperation.GetProperty:
                return this.miotDeviceClient.getProperty(
                    address, token, deviceId, stamp,
                    resolved.property.siid, resolved.property.piid
                );
            case DeviceCommandOperation.SetProperty:
                return this.miotDeviceClient.setProperty(
                    address, token, deviceId, stamp,
                    resolved.property.siid, resolved.property.piid, request.value
                );
            case DeviceCommandOperation.Action:
                return this.miotDeviceClient.callAction(
                    address, token, deviceId, stamp,
                    resolved.action.siid, resolved.action.aiid, request.value
                );
        }
    }
}
