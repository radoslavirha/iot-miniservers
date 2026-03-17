import { createSocket } from 'dgram';
import { CommonUtils } from '@radoslavirha/utils';
import { IncomingPacket, OutgoingPacket } from './packet/index.js';
import type { DiscoverResult, GetPropertiesResult } from './types.js';

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

/** Default miot protocol UDP port. */
const MIOT_PORT = 54321;

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
        port?: number
    ) {
        this.port = port ?? MIOT_PORT;
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
                if (settled) return;
                settled = true;
                socket.close();
                if (err) reject(err);
            };

            const timer = setTimeout(() => {
                done(new Error(`Handshake timeout: no response from ${this.address}:${this.port}`));
            }, MIOT_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) return;
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

            socket.send(hello, 0, hello.length, this.port, this.address, (err) => {
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
    async getProperty(deviceId: number, stamp: number, siid: number, piid: number): Promise<string | number | undefined> {
        const did = String(deviceId);
        const response = await this.sendCommand(deviceId, stamp, {
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
     * Reads multiple property values from the device, split into sequential chunks.
     *
     * @param props        - Properties to read.
     * @param stamp        - Starting stamp.
     * @param maxChunkSize - Max properties per UDP call (default 14).
     * @returns All results and the last stamp actually used.
     */
    async getProperties(
        deviceId: number,
        stamp: number,
        props: Array<{ siid: number; piid: number }>,
        maxChunkSize = 14
    ): Promise<{ results: GetPropertiesResult[]; finalStamp: number }> {
        const did = String(deviceId);
        const results: GetPropertiesResult[] = [];
        let currentStamp = stamp;

        for (let i = 0; i < props.length; i += maxChunkSize) {
            const chunk = props.slice(i, i + maxChunkSize);

            const response = await this.sendCommand(deviceId, currentStamp, {
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

        return { results, finalStamp: currentStamp };
    }

    /**
     * Writes a property value to the device.
     */
    async setProperty(deviceId: number, stamp: number, siid: number, piid: number, value: string | number): Promise<void> {
        const did = String(deviceId);
        const response = await this.sendCommand(deviceId, stamp, {
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
     * @param args - Optional action arguments. Arrays are passed as-is; scalar values are wrapped.
     */
    async callAction(deviceId: number, stamp: number, siid: number, aiid: number, args?: unknown): Promise<void> {
        const did = String(deviceId);
        let inArgs: unknown[];
        if (args === undefined) {
            inArgs = [];
        } else if (Array.isArray(args)) {
            inArgs = args;
        } else {
            inArgs = [args];
        }

        await this.sendCommand(deviceId, stamp, {
            method: 'action',
            params: { did, siid, aiid, in: inArgs }
        });
    }

    private async sendCommand(deviceId: number, stamp: number, payload: Record<string, unknown>): Promise<MiotResponse> {
        const raw = new OutgoingPacket({ token: this.token, deviceId, stamp, payload }).raw;

        return new Promise<MiotResponse>((resolve, reject) => {
            const socket = createSocket('udp4');
            let settled = false;

            const done = (err?: Error): void => {
                if (settled) return;
                settled = true;
                socket.close();
                if (err) reject(err);
            };

            const timer = setTimeout(() => {
                done(new Error(`Command timeout: no response from ${this.address}:${this.port}`));
            }, MIOT_TIMEOUT_MS);

            socket.on('message', (msg) => {
                clearTimeout(timer);
                if (settled) return;
                settled = true;
                socket.close();
                try {
                    const packet = new IncomingPacket(msg, this.token);
                    const json = packet.json as unknown as MiotResponse | null;
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

            socket.send(raw, 0, raw.length, this.port, this.address, (err) => {
                if (err) {
                    clearTimeout(timer);
                    done(err);
                }
            });
        });
    }
}
