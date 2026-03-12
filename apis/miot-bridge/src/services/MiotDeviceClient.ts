import { createSocket } from 'dgram';
import { Service, Scope, ProviderScope } from '@tsed/di';
import { IncomingPacket, OutgoingPacket } from '../miot/packet/index.js';
import { CommonUtils } from '@radoslavirha/utils';

export interface HandshakeResult {
    /** Device ID to use in subsequent commands. */
    deviceId: number;
    /** Current device stamp to use in subsequent commands. */
    stamp: number;
}

export interface GetPropertiesResult {
    siid: number;
    piid: number;
    value?: unknown;
    code: number;
}

interface MiotPropertyResult {
    did: string;
    siid: number;
    piid: number;
    value?: unknown;
    code: number;
}

interface MiotResponse {
    id: number;
    result?: unknown;
    error?: { code: number; message: string };
}

/** Default miot protocol UDP port */
const MIOT_PORT = 54321;

/** UDP command timeout in milliseconds */
const MIOT_TIMEOUT_MS = 10000;

/**
 * Low-level MIoT protocol adapter.
 * Handles UDP socket management, packet encoding/decoding, and raw device communication.
 * Contains no business logic — callers are responsible for stamp management and retries.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class MiotDeviceClient {
    /**
     * Sends a miot hello packet to the device and returns its deviceId and stamp.
     *
     * @param address IP address of the device.
     */
    async handshake(address: string): Promise<HandshakeResult> {
        const hello = new OutgoingPacket().raw;

        return new Promise<HandshakeResult>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error) => {
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
                done(new Error(`Handshake timeout: no response from ${address}:${MIOT_PORT}`));
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
                    reject(err);
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                done(err);
            });

            socket.send(hello, 0, hello.length, MIOT_PORT, address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(err);
                }
            });
        });
    }

    /**
     * Reads a single property value from the device.
     */
    async getProperty(address: string, token: string, deviceId: number, stamp: number, siid: number, piid: number): Promise<unknown> {
        const did = String(deviceId);
        const response = await this.sendCommand(address, token, deviceId, stamp, {
            method: 'get_properties',
            params: [{ did, siid, piid }]
        });

        const results = response.result as MiotPropertyResult[];
        const item = results?.[0];
        if (CommonUtils.isNil(item) || item.code !== 0) {
            throw new Error(`get_properties failed: code ${item?.code ?? 'unknown'}`);
        }
        return item.value;
    }

    /**
     * Reads multiple property values from the device in a single bulk call.
     * Props are split into sequential chunks to respect device UDP packet limits.
     *
     * @param props - Properties to read, identified by siid and piid.
     * @param maxChunkSize - Max properties per UDP call (default 14, matches device limits).
     * @returns All results and the final stamp used by the last chunk.
     */
    async getProperties(
        address: string,
        token: string,
        deviceId: number,
        stamp: number,
        props: Array<{ siid: number; piid: number }>,
        maxChunkSize = 14
    ): Promise<{ results: GetPropertiesResult[]; stamp: number }> {
        const did = String(deviceId);
        const results: GetPropertiesResult[] = [];
        let currentStamp = stamp;

        for (let i = 0; i < props.length; i += maxChunkSize) {
            const chunk = props.slice(i, i + maxChunkSize);

            const response = await this.sendCommand(address, token, deviceId, currentStamp, {
                method: 'get_properties',
                params: chunk.map(p => ({ did, siid: p.siid, piid: p.piid }))
            });

            const raw = response.result as MiotPropertyResult[];
            for (const item of raw ?? []) {
                results.push({ siid: item.siid, piid: item.piid, value: item.value, code: item.code });
            }

            if (i + maxChunkSize < props.length) {
                currentStamp++;
            }
        }

        return { results, stamp: currentStamp };
    }

    /**
     * Writes a property value to the device.
     */
    async setProperty(address: string, token: string, deviceId: number, stamp: number, siid: number, piid: number, value: unknown): Promise<void> {
        const did = String(deviceId);
        const response = await this.sendCommand(address, token, deviceId, stamp, {
            method: 'set_properties',
            params: [{ did, siid, piid, value }]
        });

        const results = response.result as MiotPropertyResult[];
        const item = results?.[0];
        if (CommonUtils.isNil(item) || item.code !== 0) {
            throw new Error(`set_properties failed: code ${item?.code ?? 'unknown'}`);
        }
    }

    /**
     * Executes an action on the device.
     *
     * @param args - Optional action arguments. Arrays are passed as-is; scalar values are wrapped in an array.
     */
    async callAction(address: string, token: string, deviceId: number, stamp: number, siid: number, aiid: number, args?: unknown): Promise<void> {
        const did = String(deviceId);
        const inArgs = args === undefined ? [] : Array.isArray(args) ? args : [args];

        await this.sendCommand(address, token, deviceId, stamp, {
            method: 'action',
            params: { did, siid, aiid, in: inArgs }
        });
    }

    /**
     * Sends a miot command packet to the device and returns the parsed JSON response.
     *
     * @throws if the device returns an error payload or the connection times out.
     */
    private async sendCommand(address: string, token: string, deviceId: number, stamp: number, payload: Record<string, unknown>): Promise<MiotResponse> {
        const raw = new OutgoingPacket({ token, deviceId, stamp, payload }).raw;

        return new Promise<MiotResponse>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error) => {
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
                done(new Error(`Command timeout: no response from ${address}:${MIOT_PORT}`));
            }, MIOT_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) {
                    return;
                }
                settled = true;
                socket.close();

                try {
                    const packet = new IncomingPacket(msg, token);
                    const json = packet.json as MiotResponse | null;
                    if (CommonUtils.isNil(json)) {
                        reject(new Error('Empty response from device'));
                        return;
                    }
                    if (CommonUtils.notNil(json.error)) {
                        reject(new Error(`Device error ${json.error.code}: ${json.error.message}`));
                        return;
                    }
                    resolve(json);
                } catch (err) {
                    reject(err);
                }
            });

            socket.on('error', (err) => {
                clearTimeout(timer);
                done(err);
            });

            socket.send(raw, 0, raw.length, MIOT_PORT, address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(err);
                }
            });
        });
    }
}
