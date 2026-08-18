import type { Attributes } from '@opentelemetry/api';
import {
    ATTR_NETWORK_TRANSPORT,
    ATTR_SERVER_ADDRESS,
    ATTR_SERVER_PORT,
    NETWORK_TRANSPORT_VALUE_UDP
} from '@opentelemetry/semantic-conventions';
import { MIOT_DEFAULT_PORT } from '@radoslavirha/miot-device';
import { withClientSpan } from '@radoslavirha/otel';
import { ATTR_MIOT_DEVICE_ID, MIOT_TRACER_NAME } from './telemetry.js';

/** The device a call is addressed to. `DeviceCache` satisfies this structurally. */
export interface MiotCallTarget {
    /** LAN address of the device. */
    readonly address: string;
    /** Xiaomi hardware device id. Absent during discovery, when it is what we are asking for. */
    readonly deviceId?: number;
    /** Only set when the device does not listen on {@link MIOT_DEFAULT_PORT}. */
    readonly port?: number;
}

export interface MiotCallSpanOptions {
    /** One of the `SPAN_MIOT_*` names — the wire method, never the device or property. */
    readonly name: string;
    readonly device: MiotCallTarget;
    /** Call-specific attributes: siid/piid/aiid, or the property count of a bulk read. */
    readonly attributes?: Attributes;
}

/**
 * Wraps a miot device call in a CLIENT span.
 *
 * `@radoslavirha/miot-device` has no OpenTelemetry dependency on purpose — it takes an injected
 * logger and nothing else — so the seam is here, at the last point that still knows which
 * device is being addressed. The call underneath is raw `dgram` with a 10s timeout and no
 * telemetry of its own: before this span existed, a device that had dropped off the LAN showed
 * up as ten silent seconds inside an HTTP or MQTT span with nothing to say what was being
 * waited on.
 *
 * A handshake triggered inside the call by a stale stamp is part of this span's duration rather
 * than a span of its own; `MiotDevice` owns that retry and does not report it.
 */
export function withMiotCallSpan<T>(options: MiotCallSpanOptions, fn: () => Promise<T>): Promise<T> {
    return withClientSpan(
        {
            name: options.name,
            tracer: MIOT_TRACER_NAME,
            attributes: {
                [ATTR_NETWORK_TRANSPORT]: NETWORK_TRANSPORT_VALUE_UDP,
                [ATTR_SERVER_ADDRESS]: options.device.address,
                [ATTR_SERVER_PORT]: options.device.port ?? MIOT_DEFAULT_PORT,
                [ATTR_MIOT_DEVICE_ID]: options.device.deviceId,
                ...options.attributes
            }
        },
        fn
    );
}
