/**
 * IncomingPacket — parses and decrypts raw miot packets received from a device.
 *
 * Usage:
 *
 *   // Parse a command response
 *   const packet = new IncomingPacket(responseBuffer, 'XXXX...');  // device token (hex string or Buffer)
 *   const json = packet.json;   // decrypted, parsed JSON object
 *   const data = packet.data;   // raw decrypted Buffer
 *
 *   // Parse a hello response (no token needed)
 *   const info = IncomingPacket.parseHello(responseBuffer);
 *   // → { deviceId: number, stamp: number, token: Buffer }
 */

import { createDecipheriv, createHash } from 'crypto';
import { BasePacket, HEADER_SIZE, MAGIC } from './BasePacket.js';
import { CommonUtils } from '@radoslavirha/utils';

export interface HelloInfo {
    /** Device ID to use in subsequent OutgoingPacket commands. */
    deviceId: number;
    /** Current device stamp to use in subsequent OutgoingPacket commands. */
    stamp: number;
    /** Raw 128-bit device token returned by an uninitialised device. */
    token: Buffer;
}

export class IncomingPacket extends BasePacket {
    /** Raw decrypted payload, or null if the packet carried no data. */
    readonly data: Buffer | null;

    /**
     * @param msg   - Raw UDP buffer received from the device.
     * @param token - Device token (hex string or Buffer) for decryption.
     */
    constructor(msg: Buffer, token: string | Buffer) {
        super(token);
        this.data = this.parseAndDecrypt(msg);
    }

    /**
     * Decrypted payload decoded as a JSON object.
     * Returns null if the packet carried no data.
     */
    get json(): Record<string, unknown> | null {
        if (CommonUtils.isNil(this.data)) {
            return null;
        }
        // Strip trailing null bytes that may appear due to AES block padding
        const text = this.data.toString('utf8').replace(/\0+$/, '');
        return JSON.parse(text);
    }

    // ─── Static ──────────────────────────────────────────────

    /**
     * Parse a hello response packet from the device.
     *
     * No token is required — the hello response is not encrypted.
     * The checksum field in a hello response contains the raw device token
     * (only for uninitialised devices; otherwise it will be all 0xFF).
     *
     * @param msg - Raw UDP buffer received in response to a hello packet.
     */
    static parseHello(msg: Buffer): HelloInfo {
        if (msg.length < HEADER_SIZE) {
            throw new Error(`Response too short: ${msg.length} bytes`);
        }

        const magic = msg.readUInt16BE(0);
        if (magic !== MAGIC) {
            throw new Error(`Invalid magic number: 0x${magic.toString(16)}`);
        }

        return {
            deviceId: msg.readUInt32BE(8),
            stamp: msg.readUInt32BE(12),
            token: msg.subarray(16, 32)
        };
    }

    private parseAndDecrypt(msg: Buffer): Buffer | null {
        if (msg.length < HEADER_SIZE) {
            throw new Error(`Packet too short: ${msg.length} bytes`);
        }

        // Load header from the message
        msg.copy(this.header, 0, 0, HEADER_SIZE);

        const encrypted = msg.subarray(HEADER_SIZE);
        if (encrypted.length === 0) return null;

        if (!this.token || !this.tokenKey || !this.tokenIV) {
            throw new Error('Token is required to decrypt response packets');
        }

        // Verify checksum: MD5(header[0:16] + token + encrypted)
        const expected = createHash('md5')
            .update(this.header.subarray(0, 16))
            .update(this.token)
            .update(encrypted)
            .digest();

        if (!this.checksum.equals(expected)) {
            throw new Error('Invalid packet checksum — token may be wrong');
        }

        // Decrypt (AES-128-CBC)
        const decipher = createDecipheriv('aes-128-cbc', this.tokenKey, this.tokenIV);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
}
