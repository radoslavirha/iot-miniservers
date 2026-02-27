import { Service, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import { CommonUtils } from '@radoslavirha/utils';
import { DeviceCommandOperation } from '../../global/models/DeviceCommandOperation.enum.js';
import { DeviceCommandRequest } from '../models/DeviceCommandRequest.js';
import { DeviceCache } from '../../global/models/DeviceCache.js';
import { DeviceStorageService } from '../../global/services/DeviceStorageService.js';
import { SimplifiedMiotSpecV2Mapper } from '../mappers/SimplifiedMiotSpecV2Mapper.js';
import { type SimplifiedMiotSpec } from '../models/simplified-miot-spec/SimplifiedMiotSpec.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MiotProperty } from '../models/simplified-miot-spec/MiotProperty.js';
import { MiotAction } from '../models/simplified-miot-spec/MiotAction.js';
import { CommandResponseModel } from '../models/CommandResponseModel.js';
import { MiotDeviceClient } from './MiotDeviceClient.js';

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
        private readonly miotDeviceClient: MiotDeviceClient
    ) {}

    async execute(request: DeviceCommandRequest): Promise<CommandResponseModel> {
        const device = await this.deviceStorageService.getByDeviceId(request.deviceId);
        if (!device) {
            throw new NotFound(`Device ${request.deviceId} not found in cache. Register the device first.`);
        }

        const spec = await this.simplifiedMiotSpecMapper.map(device.rawSpec);

        // Validate operation and resolve to typed spec entry — throws immediately for user errors (no retry)
        const resolved = this.resolveCommand(request, device.deviceId, spec);

        // First attempt using the cached stamp + 1; on failure re-handshake and retry once
        const { value, stamp, stampUpdatedAt } = await this.dispatchWithStampRefresh(request, device, resolved);

        // Persist the new stamp so the next command is accepted by the device
        await this.deviceStorageService.upsert(CommonUtils.buildModel(DeviceCache, { ...device, stamp, stampUpdatedAt }));

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
     * Attempts to dispatch the command with the cached stamp.
     *
     * If the cached stamp is older than {@link STAMP_MAX_AGE_MS}, a proactive handshake
     * is performed first to avoid a silent 10-second timeout (devices drop commands with
     * stale stamps without responding). This keeps the fast path well under 1 second
     * even when the stamp has expired.
     *
     * For fresh stamps the original flow applies: attempt with cached stamp, on failure
     * handshake once and retry.
     *
     * Throws with context if the retry also fails.
     */
    private async dispatchWithStampRefresh(
        request: DeviceCommandRequest,
        device: DeviceCache,
        resolved: ResolvedCommand
    ): Promise<{ value: unknown; stamp: number; stampUpdatedAt: number }> {
        const stampAge = Date.now() - (device.stampUpdatedAt ?? 0);

        if (stampAge > STAMP_MAX_AGE_MS) {
            // Stamp is known-stale — skip the doomed first attempt and handshake immediately
            const { stamp: freshStamp } = await this.miotDeviceClient.handshake(device.address);
            const stamp = freshStamp + 1;
            const value = await this.dispatch(request, device, stamp, resolved);
            return { value, stamp, stampUpdatedAt: Date.now() };
        }

        const stamp = device.stamp + 1;

        try {
            const value = await this.dispatch(request, device, stamp, resolved);
            return { value, stamp, stampUpdatedAt: Date.now() };
        } catch {
            // Stamp turned stale mid-session — perform handshake to recover current stamp and retry once
        }

        const { stamp: freshStamp } = await this.miotDeviceClient.handshake(device.address);
        const freshStampPlusOne = freshStamp + 1;

        try {
            const value = await this.dispatch(request, device, freshStampPlusOne, resolved);
            return { value, stamp: freshStampPlusOne, stampUpdatedAt: Date.now() };
        } catch (retryError) {
            const reason = retryError instanceof Error ? retryError.message : String(retryError);
            throw new Error(`Command '${request.command}' failed after stamp refresh for device ${request.deviceId}: ${reason}`);
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
