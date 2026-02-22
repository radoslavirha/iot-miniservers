/**
 * OutgoingPacket — builds raw miIO packets ready to send over UDP.
 *
 * Usage:
 *
 *   // Hello (handshake) packet — no args needed
 *   const raw = new OutgoingPacket().raw;
 *
 *   // Command packet
 *   const raw = new OutgoingPacket({
 *       token:    '76506e394d327a617875497243654749',
 *       payload:  { method: 'action', params: { did: '...', siid: 2, aiid: 1 } },
 *       deviceId: 1141132187,
 *       stamp:    52460,
 *   }).raw;
 */

import { createCipheriv, createHash } from 'crypto';
import { BasePacket, HEADER_SIZE } from './BasePacket.js';

export interface OutgoingPacketConfig {
    /** Device token: 32-char hex string or 16-byte Buffer. Required for command packets. */
    token?: string | Buffer;

    /**
     * JSON payload to send.
     * The `id` field is auto-injected (UNIX timestamp) if not already present,
     * as it is required by the miIO protocol for the device to route its response.
     */
    payload?: Record<string, unknown>;

    /** Device ID (uint32 BE). Obtained from an IncomingPacket hello response. */
    deviceId?: number;

    /** Stamp obtained from an IncomingPacket hello response. */
    stamp?: number;
}

export class OutgoingPacket extends BasePacket {
    private readonly payload: Record<string, unknown> | null = null;

    /** @param config - Omit entirely for a hello packet. */
    constructor(config?: OutgoingPacketConfig) {
        super(config?.token);

        if (!config) return;

        if (config.deviceId !== undefined) {
            this.header.writeUInt32BE(config.deviceId, 8);
        }

        if (config.stamp !== undefined) {
            this.header.writeUInt32BE(config.stamp, 12);
        }

        if (config.payload !== undefined) {
            // Auto-inject `id` — required by miIO for the device to send back a response
            this.payload = {
                id: Math.floor(Date.now() / 1000),
                ...config.payload
            };
        }
    }

    /**
     * Build the raw packet buffer ready to send over UDP.
     *
     * - No config / no payload → hello packet (32 bytes, all 0xFF)
     * - With payload           → AES-128-CBC encrypted command packet
     */
    get raw(): Buffer {
        if (this.payload) {
            return this.buildCommandPacket();
        }

        // Hello packet: magic + length 0x0020 + 0xFF fill
        this.header.writeUInt16BE(HEADER_SIZE, 2);
        return Buffer.from(this.header);
    }

    /**
     * Serialize the packet as a Loxone-compatible `\xNN` hex-escape string.
     *
     * Loxone virtual UDP outputs use `\x` notation for binary data
     * (e.g. `\x21\x31\x00\x20…`). Paste the result directly into
     * the "Instrukce při zapnutí" field of a Virtual UDP Output Command.
     */
    get toLoxone(): string {
        return [...this.raw]
            .map(b => `\\x${b.toString(16).padStart(2, '0')}`)
            .join('');
    }

    // ─── Private ─────────────────────────────────────────────

    private buildCommandPacket(): Buffer {
        if (!this.token || !this.tokenKey || !this.tokenIV) {
            throw new Error('Token is required to send command packets');
        }

        // Unknown1 = 0x00000000 for command packets
        this.header.writeUInt32BE(0, 4);

        // Encrypt payload (AES-128-CBC, PKCS#7 padding by default in Node.js)
        const plaintext = Buffer.from(JSON.stringify(this.payload), 'utf8');
        const cipher = createCipheriv('aes-128-cbc', this.tokenKey, this.tokenIV);
        const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

        // Total length = header + encrypted data
        this.header.writeUInt16BE(HEADER_SIZE + encrypted.length, 2);

        // Checksum: MD5(header[0:16] + token + encrypted)
        const digest = createHash('md5')
            .update(this.header.subarray(0, 16))
            .update(this.token)
            .update(encrypted)
            .digest();
        digest.copy(this.header, 16);

        return Buffer.concat([this.header, encrypted]);
    }
}
