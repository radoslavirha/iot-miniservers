/**
 * Xiaomi Mi Home Binary Protocol — shared constants and base class.
 *
 * Packet header layout (32 bytes):
 *
 *  Offset | Size | Description
 *  -------|------|------------------------------------------------------
 *   0-1   |  2   | Magic number: 0x2131
 *   2-3   |  2   | Packet length (including header), uint16 BE
 *   4-7   |  4   | Unknown1: 0x00000000 (commands) or 0xFFFFFFFF (hello)
 *   8-11  |  4   | Device ID ("did"), uint32 BE
 *  12-15  |  4   | Stamp, uint32 BE (continuously increasing counter)
 *  16-31  | 16   | MD5 checksum (or raw device token in hello response)
 *
 * Reference: https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md
 */

import { CommonUtils, StringUtils } from '@radoslavirha/utils';
import { createHash } from 'crypto';
import { HEADER_SIZE, MAGIC } from '../Constants.js';

export class BasePacket {
    protected readonly header: Buffer;
    protected readonly token: Buffer | null = null;
    protected readonly tokenKey: Buffer | null = null;
    protected readonly tokenIV: Buffer | null = null;

    constructor(token?: string | Buffer) {
        this.header = Buffer.alloc(HEADER_SIZE);
        this.header.writeUInt16BE(MAGIC, 0);

        // Default layout — all 0xFF from byte 4 (hello packet baseline)
        for (let i = 4; i < HEADER_SIZE; i++) {
            this.header[i] = 0xff;
        }

        if (CommonUtils.notNil(token)) {
            this.token = StringUtils.isString(token)
                ? Buffer.from(token, 'hex')
                : Buffer.from(token);

            if (this.token.length !== 16) {
                throw new Error(`Token must be 16 bytes (128-bit), got ${this.token.length}`);
            }

            // Key = MD5(Token)
            this.tokenKey = createHash('md5')
                .update(this.token)
                .digest();
            // IV  = MD5(Key + Token)
            this.tokenIV = createHash('md5')
                .update(this.tokenKey)
                .update(this.token)
                .digest();
        }
    }

    /** MD5 checksum field — bytes 16-31 of the header */
    get checksum(): Buffer {
        return this.header.subarray(16, 32);
    }

    /** Device ID (uint32 BE) from the header */
    get deviceId(): number {
        return this.header.readUInt32BE(8);
    }

    /** Stamp (uint32 BE) from the header */
    get stamp(): number {
        return this.header.readUInt32BE(12);
    }
}
