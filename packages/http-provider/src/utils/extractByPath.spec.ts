import { describe, expect, it } from 'vitest';
import { extractByPath } from './extractByPath.js';

describe('extractByPath', () => {
    it('extracts a top-level string field', () => {
        expect(extractByPath({ access_token: 'abc' }, 'access_token')).toBe('abc');
    });

    it('extracts a nested field via dot notation', () => {
        expect(extractByPath({ data: { token: 'xyz' } }, 'data.token')).toBe('xyz');
    });

    it('extracts deeply nested field', () => {
        expect(extractByPath({ a: { b: { c: 'deep' } } }, 'a.b.c')).toBe('deep');
    });

    it('throws when intermediate path segment is not an object', () => {
        expect(() => extractByPath({ a: 'string' }, 'a.b')).toThrow('not an object');
    });

    it('throws when extracted value is not a string', () => {
        expect(() => extractByPath({ count: 42 }, 'count')).toThrow('not a string');
    });

    it('throws when path is undefined', () => {
        expect(() => extractByPath({ a: undefined }, 'a')).toThrow('not a string');
    });
});
