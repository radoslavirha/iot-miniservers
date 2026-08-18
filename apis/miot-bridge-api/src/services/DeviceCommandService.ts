import { Service, Scope, ProviderScope } from '@tsed/di';
import { BadRequest, NotFound } from '@tsed/exceptions';
import type { Attributes, Span } from '@opentelemetry/api';
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
import {
    MIOT_METHOD_ACTION,
    MIOT_METHOD_GET_PROPERTIES,
    MIOT_METHOD_SET_PROPERTIES,
    type GetPropertiesResult,
    type MiotMethod
} from '@radoslavirha/miot-device';
import { Logger, type BaseLogger } from '@radoslavirha/tsed-logger';
import { recordMiotLocalRejection, recordPropertyRejection, withMiotCallSpan } from '../otel/miotTracing.js';
import {
    ATTR_MIOT_AIID,
    ATTR_MIOT_COMMAND,
    ATTR_MIOT_PIID,
    ATTR_MIOT_PROPERTY_COUNT,
    ATTR_MIOT_PROPERTY_REJECTED,
    ATTR_MIOT_PROPERTY_REJECTED_COUNT,
    ATTR_MIOT_SIID,
    identifierAttribute,
    MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY,
    MIOT_PROPERTY_CODE_MISSING,
    MIOT_STATUS_CODE_VALUE_MISSING,
    type MiotPropertySource
} from '../otel/telemetry.js';

/**
 * Per-key result returned by {@link DeviceCommandService.getProperties}.
 *
 * `source` rides along so a consumer can say whose spec entry a non-zero `code` belongs to without
 * re-resolving the spec — the poller logs it, and it is the difference between "the published spec
 * is wrong" and "our override is wrong".
 */
export type KeyedPropertyResult = GetPropertiesResult & { key: string; source: MiotPropertySource };

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
    private readonly logger: BaseLogger;

    constructor(
        private readonly deviceStorageService: DeviceStorageService,
        private readonly simplifiedMiotSpecMapper: SimplifiedMiotSpecV2Mapper,
        private readonly notificationDispatch: NotificationDispatchService,
        private readonly modelPropertyOverrideService: ModelPropertyOverrideService,
        private readonly registry: MiotDeviceRegistry,
        logger: Logger
    ) {
        this.logger = logger.child('DeviceCommandService');
    }

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
        const props: Array<{ key: string; siid: number; piid: number; source: MiotPropertySource }> = [];
        for (const key of keys) {
            const property = spec.properties.get(key);
            if (property) props.push({ key, siid: property.siid, piid: property.piid, source: property.source });
        }
        if (!props.length) return { miotDeviceId: device.deviceId, results: [] };

        const miotDevice = this.registry.getOrCreate(device);
        // No `propertySource` here: a bulk read mixes published and overridden entries, so the call
        // has no single provenance. The per-property refusals below carry it one at a time.
        const results = await withMiotCallSpan(
            {
                method: MIOT_METHOD_GET_PROPERTIES,
                device,
                attributes: { [ATTR_MIOT_PROPERTY_COUNT]: props.length }
            },
            async (span) => {
                const rawResults = await miotDevice.getProperties(props.map(p => ({ siid: p.siid, piid: p.piid })));
                const mapped = props.map(p => {
                    const r = rawResults.find(x => x.siid === p.siid && x.piid === p.piid);
                    return {
                        key: p.key,
                        siid: p.siid,
                        piid: p.piid,
                        source: p.source,
                        value: r?.value,
                        code: r?.code ?? MIOT_PROPERTY_CODE_MISSING
                    };
                });

                // Inside the callback, not after it: the refusals belong to *this* call, and the
                // span is already ended by the time the wrapper returns.
                this.reportRejectedProperties(span, device.deviceId, mapped);

                return mapped;
            }
        );

        return { miotDeviceId: device.deviceId, results };
    }

    /**
     * Reports the properties a bulk read came back refused.
     *
     * **This is the signal the whole exercise is about.** A bulk `get_properties` is one RPC call
     * that succeeds at the envelope level while answering `code: -4004` for individual properties,
     * so nothing about the call itself is failed — the span is green, the poller's job outcome is
     * `success`, and until now the poller simply `continue`d past every one of them. On a device
     * whose published spec is incomplete and whose gaps are patched by `model-property-overrides`,
     * these codes are the only evidence of which entries the hardware actually knows.
     *
     * Three signals, each carrying what it can afford:
     *
     * - the **metric**, bounded to code x provenance x method, so the question is answerable
     *   without a trace;
     * - the **span**, listing which keys of *this* read were refused;
     * - a **log line per refusal**, which is the only one that can afford the key and the device id
     *   together, and which correlates back to the span through the `trace_id` the logger stamps
     *   from the active span.
     */
    private reportRejectedProperties(span: Span, miotDeviceId: number, results: KeyedPropertyResult[]): void {
        const rejected = results.filter(r => r.code !== 0);
        if (!rejected.length) return;

        span.setAttributes({
            [ATTR_MIOT_PROPERTY_REJECTED]: rejected.map(r => r.key),
            [ATTR_MIOT_PROPERTY_REJECTED_COUNT]: rejected.length
        });

        for (const r of rejected) {
            const statusCode = r.code === MIOT_PROPERTY_CODE_MISSING ? MIOT_STATUS_CODE_VALUE_MISSING : String(r.code);

            recordPropertyRejection({ method: MIOT_METHOD_GET_PROPERTIES, source: r.source, statusCode });

            this.logger.warn(`Device refused property '${r.key}'.`, {
                miotDeviceId,
                property: r.key,
                siid: r.siid,
                piid: r.piid,
                propertySource: r.source,
                rpcMethod: MIOT_METHOD_GET_PROPERTIES,
                statusCode
            });
        }
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
                value = await withMiotCallSpan(
                    { method: MIOT_METHOD_GET_PROPERTIES, device, attributes: this.iidAttributes(request.siid, request.piid!) },
                    () => miotDevice.getProperty(request.siid, request.piid!)
                );
                break;
            case DeviceCommandOperation.SetProperty:
                await withMiotCallSpan(
                    { method: MIOT_METHOD_SET_PROPERTIES, device, attributes: this.iidAttributes(request.siid, request.piid!) },
                    () => miotDevice.setProperty(request.siid, request.piid!, request.value as string | number)
                );
                break;
            case DeviceCommandOperation.Action:
                await withMiotCallSpan(
                    {
                        method: MIOT_METHOD_ACTION,
                        device,
                        attributes: {
                            [ATTR_MIOT_SIID]: identifierAttribute(request.siid),
                            [ATTR_MIOT_AIID]: identifierAttribute(request.aiid)
                        }
                    },
                    () => miotDevice.callAction(request.siid, request.aiid!, request.value)
                );
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
        const resolved = this.resolveOrRecordRejection(request, device.deviceId, spec);

        const miotDevice = this.registry.getOrCreate(device);
        let value: string | number | undefined;

        switch (resolved.operation) {
            case DeviceCommandOperation.GetProperty:
                value = await withMiotCallSpan(
                    {
                        method: MIOT_METHOD_GET_PROPERTIES,
                        device,
                        propertySource: resolved.property.source,
                        attributes: {
                            ...this.iidAttributes(resolved.property.siid, resolved.property.piid),
                            [ATTR_MIOT_COMMAND]: request.command
                        }
                    },
                    () => miotDevice.getProperty(resolved.property.siid, resolved.property.piid)
                );
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
                await withMiotCallSpan(
                    {
                        method: MIOT_METHOD_SET_PROPERTIES,
                        device,
                        propertySource: resolved.property.source,
                        attributes: {
                            ...this.iidAttributes(resolved.property.siid, resolved.property.piid),
                            [ATTR_MIOT_COMMAND]: request.command
                        }
                    },
                    () => miotDevice.setProperty(resolved.property.siid, resolved.property.piid, request.value as string | number)
                );
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
                await withMiotCallSpan(
                    {
                        method: MIOT_METHOD_ACTION,
                        device,
                        attributes: {
                            [ATTR_MIOT_SIID]: identifierAttribute(resolved.action.siid),
                            [ATTR_MIOT_AIID]: identifierAttribute(resolved.action.aiid),
                            [ATTR_MIOT_COMMAND]: request.command
                        }
                    },
                    () => miotDevice.callAction(resolved.action.siid, resolved.action.aiid, request.value)
                );
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
     * Service and property instance ids for a single-property call, so a span says which
     * property was being read when the device stopped answering.
     */
    private iidAttributes(siid: number, piid: number): Attributes {
        return { [ATTR_MIOT_SIID]: identifierAttribute(siid), [ATTR_MIOT_PIID]: identifierAttribute(piid) };
    }

    /**
     * {@link resolveCommand}, with the refusal made observable.
     *
     * A spec violation is rejected before the device is addressed, so there is no client span to
     * hang it on — one would claim a call that never left the process. That leaves the metric as
     * the only always-on evidence, and it is worth having: `rejected_locally` means Loxone asked
     * for a key that is in neither the published spec nor the overrides, which is the mirror image
     * of a device refusal and points at the same table from the other side.
     */
    private resolveOrRecordRejection(request: DeviceCommandRequest, deviceId: number, spec: SimplifiedMiotSpec): ResolvedCommand {
        try {
            return this.resolveCommand(request, deviceId, spec);
        } catch (error) {
            const method = miotMethodOf(request.operation);

            recordMiotLocalRejection({ method });
            this.logger.warn(`Rejected command '${request.command}' before sending.`, {
                miotDeviceId: deviceId,
                property: request.command,
                operation: request.operation,
                rpcMethod: method,
                errorType: MIOT_ERROR_TYPE_VALUE_REJECTED_LOCALLY,
                reason: error instanceof Error ? error.message : String(error)
            });

            throw error;
        }
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

/**
 * The miIO wire method a `DeviceCommandOperation` would have used.
 *
 * Needed only on the local-rejection path, where the call is abandoned before the transport
 * chooses one — without it every rejected command would share a single `rpc.method` and reads
 * would be indistinguishable from writes in the metric.
 */
function miotMethodOf(operation: DeviceCommandOperation): MiotMethod {
    switch (operation) {
        case DeviceCommandOperation.SetProperty:
            return MIOT_METHOD_SET_PROPERTIES;
        case DeviceCommandOperation.Action:
            return MIOT_METHOD_ACTION;
        default:
            return MIOT_METHOD_GET_PROPERTIES;
    }
}
