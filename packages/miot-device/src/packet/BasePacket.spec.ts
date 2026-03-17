import { describe, expect, it } from 'vitest';
import { createHash } from 'crypto';
import { BasePacket } from './BasePacket.js';

/**
 * Concrete subclass so we can instantiate the abstract-ish BasePacket.
 */
class TestPacket extends BasePacket {
    constructor(token?: string | Buffer) {
        super(token);
    }

    public getHeader(): Buffer {
        return this.header;
    }

    public getToken(): Buffer | null {
        return this.token;
    }

    public getTokenKey(): Buffer | null {
        return this.tokenKey;
    }

    public getTokenIV(): Buffer | null {
        return this.tokenIV;
    }
}

describe('BasePacket', () => {
    describe('constructor — no token (hello baseline)', () => {
        it('allocates a 32-byte header', () => {
            const pkt = new TestPacket();
            expect(pkt.getHeader().length).toBe(32);
        });

        it('writes magic number at offset 0', () => {
            const pkt = new TestPacket();
            expect(pkt.getHeader().readUInt16BE(0)).toBe(0x2131);
        });

        it('fills bytes 4–31 with 0xFF', () => {
            const pkt = new TestPacket();
            const header = pkt.getHeader();
            for (let i = 4; i < 32; i++) {
                expect(header[i]).toBe(0xff);
            }
        });

        it('leaves token fields as null', () => {
            const pkt = new TestPacket();
            expect(pkt.getToken()).toBeNull();
            expect(pkt.getTokenKey()).toBeNull();
            expect(pkt.getTokenIV()).toBeNull();
        });
    });

    describe('constructor — with hex string token', () => {
        const TOKEN_HEX = '00112233445566778899aabbccddeeff'; // 32 hex chars = 16 bytes

        it('stores token as Buffer', () => {
            const pkt = new TestPacket(TOKEN_HEX);
            const token = pkt.getToken();
            expect(token).not.toBeNull();
            expect(token!.length).toBe(16);
            expect(token!.toString('hex')).toBe(TOKEN_HEX);
        });

        it('derives tokenKey as MD5(token)', () => {
            const pkt = new TestPacket(TOKEN_HEX);
            const expected = createHash('md5')
                .update(Buffer.from(TOKEN_HEX, 'hex'))
                .digest();
            expect(pkt.getTokenKey()).toEqual(expected);
        });

        it('derives tokenIV as MD5(key + token)', () => {
            const pkt = new TestPacket(TOKEN_HEX);
            const tokenBuf = Buffer.from(TOKEN_HEX, 'hex');
            const key = createHash('md5').update(tokenBuf).digest();
            const expected = createHash('md5').update(key).update(tokenBuf).digest();
            expect(pkt.getTokenIV()).toEqual(expected);
        });
    });

    describe('constructor — with Buffer token', () => {
        const tokenBuf = Buffer.from('deadbeefcafebabe0102030405060708', 'hex');

        it('accepts a Buffer token directly', () => {
            const pkt = new TestPacket(tokenBuf);
            expect(pkt.getToken()).toEqual(tokenBuf);
        });
    });

    describe('constructor — invalid token', () => {
        it('throws when token hex is shorter than 16 bytes', () => {
            expect(() => new TestPacket('aabb')).toThrow('Token must be 16 bytes');
        });

        it('throws when token Buffer is not 16 bytes', () => {
            expect(() => new TestPacket(Buffer.alloc(8))).toThrow('Token must be 16 bytes');
        });
    });

    describe('accessors', () => {
        it('checksum returns bytes 16–31 of the header', () => {
            const pkt = new TestPacket();
            const cs = pkt.checksum;
            expect(cs.length).toBe(16);
            // Default 0xFF fill means checksum should also be all 0xFF
            for (const b of cs) {
                expect(b).toBe(0xff);
            }
        });

        it('deviceId reads uint32 BE from offset 8 (default 0xFFFFFFFF → 4294967295)', () => {
            const pkt = new TestPacket();
            expect(pkt.deviceId).toBe(0xffffffff);
        });

        it('stamp reads uint32 BE from offset 12 (default 0xFFFFFFFF → 4294967295)', () => {
            const pkt = new TestPacket();
            expect(pkt.stamp).toBe(0xffffffff);
        });

        it('deviceId reflects manually written value', () => {
            const pkt = new TestPacket();
            pkt.getHeader().writeUInt32BE(12345, 8);
            expect(pkt.deviceId).toBe(12345);
        });

        it('stamp reflects manually written value', () => {
            const pkt = new TestPacket();
            pkt.getHeader().writeUInt32BE(99999, 12);
            expect(pkt.stamp).toBe(99999);
        });
    });
});
