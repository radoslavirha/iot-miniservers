import { describe, expect, it } from 'vitest';
import { identifierAttribute } from './telemetry.js';

describe('identifierAttribute', () => {
    it('Should render a numeric identifier as a string', () => {
        expect(identifierAttribute(1141132187)).toBe('1141132187');
    });

    it('Should leave an identifier that is already a string alone', () => {
        expect(identifierAttribute('a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    });

    // The reason this is a helper rather than a bare `String()` at each call site: a miot handshake
    // is the call that *asks* for the device id, so `MiotCallTarget.deviceId` is undefined there.
    // `String(undefined)` would put the literal `"undefined"` on that span and make it match a
    // TraceQL filter for a device that does not exist.
    it('Should keep an absent identifier absent rather than stringify undefined', () => {
        expect(identifierAttribute(undefined)).toBeUndefined();
    });
});
