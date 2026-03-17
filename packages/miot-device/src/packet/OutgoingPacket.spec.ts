import { createDecipheriv, createHash } from 'crypto';
import { describe, expect, it } from 'vitest';
import { HEADER_SIZE } from '../Constants.js';
import { OutgoingPacket } from './OutgoingPacket.js';

const TOKEN_HEX = '00112233445566778899aabbccddeeff';
const TOKEN_BUF = Buffer.from(TOKEN_HEX, 'hex');

/** MD5 of the token (= AES key used by OutgoingPacket). */
const TOKEN_KEY = createHash('md5').update(TOKEN_BUF).digest();
/** MD5 of key||token (= AES IV). */
const TOKEN_IV = createHash('md5').update(TOKEN_KEY).update(TOKEN_BUF).digest();

describe('OutgoingPacket', () => {
    describe('hello packet (no config)', () => {
        it('builds a 32-byte buffer', () => {
            const raw = new OutgoingPacket().raw;
            expect(raw.length).toBe(HEADER_SIZE);
        });

        it('starts with magic number 0x2131', () => {
            const raw = new OutgoingPacket().raw;
            expect(raw.readUInt16BE(0)).toBe(0x2131);
        });

        it('sets length field to 0x0020 (32)', () => {
            const raw = new OutgoingPacket().raw;
            expect(raw.readUInt16BE(2)).toBe(0x0020);
        });

        it('bytes 4–7 are 0xFF (unknown1)', () => {
            const raw = new OutgoingPacket().raw;
            for (let i = 4; i < 8; i++) {
                expect(raw[i]).toBe(0xff);
            }
        });
    });

    describe('command packet', () => {
        const deviceId = 123456;
        const stamp = 52460;
        const payload = { method: 'get_properties', params: [] };

        function buildRaw(overrides: object = {}): Buffer {
            return new OutgoingPacket({
                token: TOKEN_HEX,
                deviceId,
                stamp,
                payload,
                ...overrides
            }).raw;
        }

        it('length is greater than 32 (header + encrypted payload)', () => {
            const raw = buildRaw();
            expect(raw.length).toBeGreaterThan(HEADER_SIZE);
        });

        it('packet length field matches actual buffer length', () => {
            const raw = buildRaw();
            expect(raw.readUInt16BE(2)).toBe(raw.length);
        });

        it('device ID is written at bytes 8–11', () => {
            const raw = buildRaw();
            expect(raw.readUInt32BE(8)).toBe(deviceId);
        });

        it('stamp is written at bytes 12–15', () => {
            const raw = buildRaw();
            expect(raw.readUInt32BE(12)).toBe(stamp);
        });

        it('unknown1 bytes 4–7 are 0x00 for command packets', () => {
            const raw = buildRaw();
            expect(raw.readUInt32BE(4)).toBe(0);
        });

        it('checksum (bytes 16–31) is correct MD5', () => {
            const raw = buildRaw();
            const encrypted = raw.subarray(HEADER_SIZE);
            const expected = createHash('md5')
                .update(raw.subarray(0, 16))
                .update(TOKEN_BUF)
                .update(encrypted)
                .digest();
            expect(raw.subarray(16, 32)).toEqual(expected);
        });

        it('auto-injects `id` field into the payload if not present', () => {
            // We reconstruct—auto id is always injected, so let's just verify
            // we can decrypt and `id` is a number.
            const raw = buildRaw();
            const encrypted = raw.subarray(HEADER_SIZE);
            const decipher = createDecipheriv('aes-128-cbc', TOKEN_KEY, TOKEN_IV);
            const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()])
                .toString('utf8')
                .replace(/\0+$/, '');
            const parsed = JSON.parse(plaintext);
            expect(typeof parsed.id).toBe('number');
        });

        it('passes through existing `id` if caller provides it', () => {
            const raw = buildRaw({ payload: { id: 42, method: 'get_properties', params: [] } });
            // The implementation uses { id: auto, ...config.payload }, so config.payload
            // spreads after the auto-id, meaning the caller-provided id wins.
            const encrypted = raw.subarray(HEADER_SIZE);
            const decipher = createDecipheriv('aes-128-cbc', TOKEN_KEY, TOKEN_IV);
            const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()])
                .toString('utf8')
                .replace(/\0+$/, '');
            const parsed = JSON.parse(plaintext);
            // Caller id=42 spreads after auto-id, so parsed.id should be 42
            expect(parsed.id).toBe(42);
        });

        it('throws when token is missing for command packet', () => {
            expect(() =>
                new OutgoingPacket({ deviceId, stamp, payload }).raw
            ).toThrow('Token is required to send command packets');
        });

        it('accepts Buffer token', () => {
            const raw = new OutgoingPacket({ token: TOKEN_BUF, deviceId, stamp, payload }).raw;
            expect(raw.length).toBeGreaterThan(HEADER_SIZE);
        });
    });

    describe('partial config', () => {
        it('deviceId defaults to 0xFFFFFFFF when not set', () => {
            const raw = new OutgoingPacket({ token: TOKEN_HEX, stamp: 1, payload: { method: 'x' } }).raw;
            // bytes 4–7 become 0 for command packet; deviceId at 8–11
            // since no deviceId provided, the header was initialised with 0xFF
            expect(raw.readUInt32BE(8)).toBe(0xffffffff);
        });

        it('stamp defaults to 0xFFFFFFFF when not set', () => {
            const raw = new OutgoingPacket({ token: TOKEN_HEX, deviceId: 1, payload: { method: 'x' } }).raw;
            expect(raw.readUInt32BE(12)).toBe(0xffffffff);
        });

        it('produces hello packet when config has no payload', () => {
            // notNil(config.payload) = false → this.payload stays null → hello packet path
            const raw = new OutgoingPacket({ token: TOKEN_HEX, deviceId: 1, stamp: 10 }).raw;
            expect(raw.length).toBe(HEADER_SIZE);
        });
    });
});
