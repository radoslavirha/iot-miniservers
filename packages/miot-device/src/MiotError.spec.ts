import { describe, expect, it } from 'vitest';
import {
    MiotError,
    MIOT_ERROR_DEVICE_ERROR,
    MIOT_ERROR_TIMEOUT,
    MIOT_ERROR_TRANSPORT_ERROR,
    MIOT_METHOD_ACTION,
    MIOT_METHOD_GET_PROPERTIES
} from './MiotError.js';

describe('MiotError', () => {
    it('carries the failure class, the method and the device code', () => {
        const error = new MiotError('Device error -4004: property not exist', {
            kind: MIOT_ERROR_DEVICE_ERROR,
            method: MIOT_METHOD_GET_PROPERTIES,
            code: -4004
        });

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe('MiotError');
        expect(error.kind).toBe(MIOT_ERROR_DEVICE_ERROR);
        expect(error.method).toBe(MIOT_METHOD_GET_PROPERTIES);
        expect(error.code).toBe(-4004);
        expect(error.stampRefreshed).toBe(false);
    });

    // A timeout is silence: there is no response to read a code out of, and inventing one would
    // make "the device refused this property" and "the device is off the LAN" look alike.
    it('leaves the code absent when the device said nothing', () => {
        const error = new MiotError('Command timeout', { kind: MIOT_ERROR_TIMEOUT, method: MIOT_METHOD_ACTION });

        expect(error.code).toBeUndefined();
    });

    it('keeps the underlying failure as the cause', () => {
        const cause = new Error('EHOSTUNREACH');
        const error = new MiotError('EHOSTUNREACH', {
            kind: MIOT_ERROR_TRANSPORT_ERROR,
            method: MIOT_METHOD_ACTION,
            cause
        });

        expect(error.cause).toBe(cause);
    });

    describe('is()', () => {
        it('narrows a MiotError', () => {
            expect(MiotError.is(new MiotError('x', { kind: MIOT_ERROR_TIMEOUT, method: MIOT_METHOD_ACTION }))).toBe(true);
        });

        it('rejects a plain Error and a non-error', () => {
            expect(MiotError.is(new Error('x'))).toBe(false);
            expect(MiotError.is('x')).toBe(false);
            expect(MiotError.is(undefined)).toBe(false);
        });
    });

    describe('afterStampRefresh()', () => {
        // The regression this class exists for: the retry used to rebuild the failure as a plain
        // `Error` whose message quoted the original, so the code survived only as a substring.
        it('preserves kind and code through the retry wrapper', () => {
            const original = new MiotError('Device error -4004: property not exist', {
                kind: MIOT_ERROR_DEVICE_ERROR,
                method: MIOT_METHOD_GET_PROPERTIES,
                code: -4004
            });

            const wrapped = MiotError.afterStampRefresh(original, MIOT_METHOD_GET_PROPERTIES, 1141132187);

            expect(wrapped.kind).toBe(MIOT_ERROR_DEVICE_ERROR);
            expect(wrapped.code).toBe(-4004);
            expect(wrapped.method).toBe(MIOT_METHOD_GET_PROPERTIES);
            expect(wrapped.stampRefreshed).toBe(true);
            expect(wrapped.cause).toBe(original);
            expect(wrapped.message).toContain('1141132187');
        });

        it('classifies an unrecognised throw as a transport error', () => {
            const wrapped = MiotError.afterStampRefresh('boom', MIOT_METHOD_ACTION, 42);

            expect(wrapped.kind).toBe(MIOT_ERROR_TRANSPORT_ERROR);
            expect(wrapped.method).toBe(MIOT_METHOD_ACTION);
            expect(wrapped.code).toBeUndefined();
            expect(wrapped.stampRefreshed).toBe(true);
        });
    });
});
