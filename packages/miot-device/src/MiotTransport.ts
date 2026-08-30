import { createSocket } from 'dgram';
import { ArrayUtils, CommonUtils } from '@radoslavirha/utils';
import { MIOT_DEFAULT_PORT } from './Constants.js';
import {
    MiotError,
    MIOT_ERROR_DEVICE_ERROR,
    MIOT_ERROR_TIMEOUT,
    MIOT_ERROR_TRANSPORT_ERROR,
    MIOT_METHOD_ACTION,
    MIOT_METHOD_GET_PROPERTIES,
    MIOT_METHOD_HANDSHAKE,
    MIOT_METHOD_SET_PROPERTIES,
    type MiotMethod
} from './MiotError.js';
import { CONSOLE_LOGGER } from './consoleLogger.js';
import { IncomingPacket, OutgoingPacket } from './packet/index.js';
import type { DiscoverResult, GetPropertiesResult, ILogger } from './types.js';

interface MiotPropertyResult {
    did: string;
    siid: number;
    piid: number;
    value?: string | number;
    code: number;
}

interface MiotResponse {
    id: number;
    result?: string | number | unknown;
    error?: { code: number; message: string };
}

/** A miIO request body. `method` is typed so it can be carried onto the failure unchanged. */
interface MiotRequestPayload extends Record<string, unknown> {
    method: MiotMethod;
    params: unknown;
}

/**
 * A failure of the packet exchange rather than of the device: a socket error, a failed `send`, or
 * a response that would not decrypt or parse.
 *
 * Every call site passes a raw throw from `dgram` or from packet parsing, never an
 * already-classified failure — a device refusal is `reject`ed directly and never reaches a
 * `catch` here. A late socket error arriving after the timeout already settled is dropped by the
 * `settled` guard in `done`, so the timeout keeps its classification without needing one here.
 */
function transportError(method: MiotMethod, cause: unknown): MiotError {
    return new MiotError(cause instanceof Error ? cause.message : String(cause), {
        kind: MIOT_ERROR_TRANSPORT_ERROR,
        method,
        cause
    });
}

/**
 * A per-property refusal on a single-property call.
 *
 * The envelope was fine; the device answered with a non-zero `code` for this one property, which
 * is the answer that says whether a spec entry is real. A missing result item has no code to
 * report and stays `undefined` rather than being given a fake one.
 */
function propertyError(method: MiotMethod, code: number | undefined): MiotError {
    return new MiotError(`${method} failed: code ${code ?? 'unknown'}`, {
        kind: MIOT_ERROR_DEVICE_ERROR,
        method,
        code
    });
}

/** UDP command/handshake timeout in milliseconds. */
const MIOT_TIMEOUT_MS = 10_000;

/**
 * Stateless UDP transport layer for the Xiaomi MIoT binary protocol.
 * Handles socket lifecycle, packet encoding/decoding. No stamp logic here.
 *
 * @internal — consumed by {@link MiotDevice}.
 */
export class MiotTransport {
    private readonly port: number;

    constructor(
        private readonly address: string,
        private readonly token: string,
        port?: number,
        private readonly logger: ILogger = CONSOLE_LOGGER
    ) {
        this.port = port ?? MIOT_DEFAULT_PORT;
    }

    /**
     * Sends a hello packet and returns the device ID and current stamp.
     * Does not require a token — hello packets are unencrypted.
     */
    async handshake(): Promise<DiscoverResult> {
        const hello = new OutgoingPacket().raw;

        return new Promise<DiscoverResult>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                socket.close();
                if (err) {
                    reject(err);
                }
            };

            const timer = setTimeout(() => {
                done(new MiotError(`Handshake timeout: no response from ${this.address}:${this.port}`, {
                    kind: MIOT_ERROR_TIMEOUT,
                    method: MIOT_METHOD_HANDSHAKE
                }));
            }, MIOT_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) {
                    return;
                }
                settled = true;
                socket.close();
                try {
                    const { deviceId, stamp } = IncomingPacket.parseHello(msg);
                    resolve({ deviceId, stamp });
                } catch (err) {
                    reject(transportError(MIOT_METHOD_HANDSHAKE, err));
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                done(transportError(MIOT_METHOD_HANDSHAKE, err));
            });

            socket.send(hello, 0, hello.length, this.port, this.address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(transportError(MIOT_METHOD_HANDSHAKE, err));
                }
            });
        });
    }

    /**
     * Reads a single property value from the device.
     */
    async getProperty(deviceId: number, stamp: number, siid: number, piid: number): Promise<string | number | undefined> {
        const did = String(deviceId);
        this.logger.debug(`get_properties`, { deviceId, siid, piid, stamp });
        const response = await this.sendCommand(deviceId, stamp, {
            method: MIOT_METHOD_GET_PROPERTIES,
            params: [{ did, siid, piid }]
        });

        const results = response.result as MiotPropertyResult[];
        const item = results?.[0];
        if (CommonUtils.isNil(item) || item.code !== 0) {
            this.logger.error(`get_properties failed`, { deviceId, siid, piid, code: item?.code ?? 'unknown' });
            throw propertyError(MIOT_METHOD_GET_PROPERTIES, item?.code);
        }
        return item.value;
    }

    /**
     * Reads multiple property values from the device, **one property per packet**.
     *
     * The protocol permits several properties in a single `get_properties` — this deliberately
     * does not use that. On 2026-08-30 a 5-property read fed the poller unchanged values for 11
     * minutes across a property change made through the Xiaomi app, while a single-property read
     * issued in the same minute returned the new value. The device is a black box and the reason
     * is not established; what is established is that the one-property call shape reflects
     * changes and the multi-property one did not.
     *
     * That trade was never worth taking: batching saved four datagrams per poll cycle against one
     * LAN device, at the cost of a read whose correctness this library cannot verify per device.
     * A polling loop over consumer hardware should not depend on an optimisation it cannot check.
     * Reinstating batching needs evidence from a real device, not a reading of the spec.
     *
     * Stamp handling is unchanged: one increment between packets, exactly as the chunk loop did.
     *
     * @param props - Properties to read.
     * @param stamp - Starting stamp.
     * @returns All results and the last stamp actually used.
     */
    async getProperties(
        deviceId: number,
        stamp: number,
        props: Array<{ siid: number; piid: number }>
    ): Promise<{ results: GetPropertiesResult[]; finalStamp: number }> {
        const did = String(deviceId);
        const results: GetPropertiesResult[] = [];
        let currentStamp = stamp;

        for (const [index, prop] of props.entries()) {
            const response = await this.sendCommand(deviceId, currentStamp, {
                method: MIOT_METHOD_GET_PROPERTIES,
                params: [{ did, siid: prop.siid, piid: prop.piid }]
            });

            const raw = response.result as MiotPropertyResult[];
            for (const item of raw ?? []) {
                results.push({ siid: item.siid, piid: item.piid, value: item.value, code: item.code });
            }

            if (index < props.length - 1) {
                currentStamp++;
            }
        }

        return { results, finalStamp: currentStamp };
    }

    /**
     * Writes a property value to the device.
     */
    async setProperty(deviceId: number, stamp: number, siid: number, piid: number, value: string | number): Promise<void> {
        const did = String(deviceId);
        this.logger.debug(`set_properties`, { deviceId, siid, piid, value, stamp });
        const response = await this.sendCommand(deviceId, stamp, {
            method: MIOT_METHOD_SET_PROPERTIES,
            params: [{ did, siid, piid, value }]
        });

        const results = response.result as MiotPropertyResult[];
        const item = results?.[0];
        if (CommonUtils.isNil(item) || item.code !== 0) {
            this.logger.error(`set_properties failed`, { deviceId, siid, piid, code: item?.code ?? 'unknown' });
            throw propertyError(MIOT_METHOD_SET_PROPERTIES, item?.code);
        }
    }

    /**
     * Executes an action on the device.
     *
     * @param args - Optional action arguments. Arrays are passed as-is; scalar values are wrapped.
     */
    async callAction(deviceId: number, stamp: number, siid: number, aiid: number, args?: unknown): Promise<void> {
        const did = String(deviceId);
        let inArgs: unknown[];
        if (CommonUtils.isUndefined(args)) {
            inArgs = [];
        } else if (ArrayUtils.isArray(args)) {
            inArgs = args;
        } else {
            inArgs = [args];
        }

        this.logger.debug(`action`, { deviceId, siid, aiid, stamp });
        await this.sendCommand(deviceId, stamp, {
            method: MIOT_METHOD_ACTION,
            params: { did, siid, aiid, in: inArgs }
        });
    }

    private async sendCommand(deviceId: number, stamp: number, payload: MiotRequestPayload): Promise<MiotResponse> {
        const method = payload.method;
        this.logger.debug(`Sending command`, { deviceId, method, stamp });
        const raw = new OutgoingPacket({ token: this.token, deviceId, stamp, payload }).raw;

        return new Promise<MiotResponse>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error): void => {
                if (settled) {
                    return;
                }
                settled = true;
                socket.close();
                if (err) {
                    reject(err);
                }
            };

            const timer = setTimeout(() => {
                done(new MiotError(`Command timeout: no response from ${this.address}:${this.port}`, {
                    kind: MIOT_ERROR_TIMEOUT,
                    method
                }));
            }, MIOT_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) {
                    return;
                }
                settled = true;
                socket.close();
                try {
                    const packet = new IncomingPacket(msg, this.token);
                    const json = packet.json as unknown as MiotResponse | null;
                    if (CommonUtils.isNil(json)) {
                        this.logger.error(`Empty response from device`, { address: this.address, method });
                        reject(new MiotError('Empty response from device', { kind: MIOT_ERROR_TRANSPORT_ERROR, method }));
                        return;
                    }
                    if (CommonUtils.notNil(json.error)) {
                        this.logger.error(`Device error`, {
                            address: this.address,
                            method,
                            code: json.error.code,
                            message: json.error.message
                        });
                        // The code is the payload, not decoration: it is the only thing that
                        // separates "the device does not implement this property" from "the device
                        // is busy" from "our token is wrong".
                        reject(new MiotError(`Device error ${json.error.code}: ${json.error.message}`, {
                            kind: MIOT_ERROR_DEVICE_ERROR,
                            method,
                            code: json.error.code
                        }));
                        return;
                    }
                    this.logger.debug(`Command response received`, { deviceId, id: json.id });
                    resolve(json);
                } catch (err) {
                    reject(transportError(method, err));
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                done(transportError(method, err));
            });

            socket.send(raw, 0, raw.length, this.port, this.address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(transportError(method, err));
                }
            });
        });
    }
}
