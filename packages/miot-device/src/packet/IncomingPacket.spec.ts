import { createCipheriv, createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { HEADER_SIZE } from '../Constants.js';
import { IncomingPacket } from './IncomingPacket.js';

const TOKEN_HEX = '00112233445566778899aabbccddeeff';
const TOKEN_BUF = Buffer.from(TOKEN_HEX, 'hex');
const TOKEN_KEY = createHash('md5').update(TOKEN_BUF).digest();
const TOKEN_IV = createHash('md5').update(TOKEN_KEY).update(TOKEN_BUF).digest();

/** Build a syntactically valid encrypted packet that IncomingPacket can parse. */
function buildValidPacket(payload: Record<string, unknown>, deviceId = 0, stamp = 0): Buffer {
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const cipher = createCipheriv('aes-128-cbc', TOKEN_KEY, TOKEN_IV);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

    const header = Buffer.alloc(HEADER_SIZE);
    header.writeUInt16BE(0x2131, 0);
    header.writeUInt16BE(HEADER_SIZE + encrypted.length, 2);
    header.writeUInt32BE(0, 4);
    header.writeUInt32BE(deviceId, 8);
    header.writeUInt32BE(stamp, 12);

    const checksum = createHash('md5')
        .update(header.subarray(0, 16))
        .update(TOKEN_BUF)
        .update(encrypted)
        .digest();
    checksum.copy(header, 16);

    return Buffer.concat([header, encrypted]);
}

/** Build a minimal hello-response buffer (32 bytes, no encryption). */
function buildHelloResponse(deviceId: number, stamp: number, tokenBytes = Buffer.alloc(16, 0xff)): Buffer {
    const buf = Buffer.alloc(HEADER_SIZE);
    buf.writeUInt16BE(0x2131, 0);
    buf.writeUInt16BE(HEADER_SIZE, 2);
    buf.writeUInt32BE(0xffffffff, 4);
    buf.writeUInt32BE(deviceId, 8);
    buf.writeUInt32BE(stamp, 12);
    tokenBytes.copy(buf, 16);
    return buf;
}

describe('IncomingPacket', () => {
    describe('constructor — valid encrypted packet', () => {
        it('decrypts and exposes data', () => {
            const payload = { id: 1, result: 'ok' };
            const raw = buildValidPacket(payload);
            const pkt = new IncomingPacket(raw, TOKEN_HEX);
            expect(pkt.data).not.toBeNull();
        });

        it('json getter returns parsed object', () => {
            const payload = { id: 1, result: [{ siid: 2, piid: 3, value: 42, code: 0 }] };
            const raw = buildValidPacket(payload);
            const pkt = new IncomingPacket(raw, TOKEN_HEX);
            expect(pkt.json).toEqual(payload);
        });

        it('exposes deviceId from header', () => {
            const raw = buildValidPacket({ id: 1 }, 9876, 500);
            const pkt = new IncomingPacket(raw, TOKEN_HEX);
            expect(pkt.deviceId).toBe(9876);
        });

        it('exposes stamp from header', () => {
            const raw = buildValidPacket({ id: 1 }, 0, 500);
            const pkt = new IncomingPacket(raw, TOKEN_HEX);
            expect(pkt.stamp).toBe(500);
        });

        it('accepts Buffer token', () => {
            const raw = buildValidPacket({ id: 1, result: 'ok' });
            const pkt = new IncomingPacket(raw, TOKEN_BUF);
            expect(pkt.json).toEqual({ id: 1, result: 'ok' });
        });
    });

    describe('constructor — header-only packet (no payload)', () => {
        it('data is null when no encrypted body', () => {
            const header = Buffer.alloc(HEADER_SIZE, 0xff);
            header.writeUInt16BE(0x2131, 0);
            header.writeUInt16BE(HEADER_SIZE, 2);
            const pkt = new IncomingPacket(header, TOKEN_HEX);
            expect(pkt.data).toBeNull();
        });

        it('json is null when data is null', () => {
            const header = Buffer.alloc(HEADER_SIZE, 0xff);
            header.writeUInt16BE(0x2131, 0);
            header.writeUInt16BE(HEADER_SIZE, 2);
            const pkt = new IncomingPacket(header, TOKEN_HEX);
            expect(pkt.json).toBeNull();
        });
    });

    describe('constructor — error cases', () => {
        it('throws when packet is shorter than 32 bytes', () => {
            expect(() => new IncomingPacket(Buffer.alloc(16), TOKEN_HEX)).toThrow('Packet too short');
        });

        it('throws when checksum is wrong (bad token)', () => {
            const raw = buildValidPacket({ id: 1 });
            const wrongToken = 'ffffffffffffffffffffffffffffffff';
            expect(() => new IncomingPacket(raw, wrongToken)).toThrow('Invalid packet checksum');
        });

        it('throws when no token is provided for an encrypted packet', () => {
            const raw = buildValidPacket({ id: 1 });
            // null token → BasePacket skips token setup → token/tokenKey/tokenIV remain null
            expect(() => new IncomingPacket(raw, null as unknown as string)).toThrow('Token is required to decrypt response packets');
        });
    });

    describe('parseHello()', () => {
        it('parses deviceId correctly', () => {
            const buf = buildHelloResponse(555, 100);
            const info = IncomingPacket.parseHello(buf);
            expect(info.deviceId).toBe(555);
        });

        it('parses stamp correctly', () => {
            const buf = buildHelloResponse(1, 99999);
            const info = IncomingPacket.parseHello(buf);
            expect(info.stamp).toBe(99999);
        });

        it('returns token bytes from checksum field', () => {
            const tokenBytes = Buffer.from('aabbccddeeff00112233445566778899', 'hex');
            const buf = buildHelloResponse(1, 1, tokenBytes);
            const info = IncomingPacket.parseHello(buf);
            expect(info.token).toEqual(tokenBytes);
        });

        it('throws when buffer is too short', () => {
            expect(() => IncomingPacket.parseHello(Buffer.alloc(10))).toThrow('Response too short');
        });

        it('throws on invalid magic number', () => {
            const buf = buildHelloResponse(1, 1);
            buf.writeUInt16BE(0x0000, 0); // corrupt magic
            expect(() => IncomingPacket.parseHello(buf)).toThrow('Invalid magic number');
        });
    });
});
