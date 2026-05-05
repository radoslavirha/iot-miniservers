import { describe, expect, it } from 'vitest';
import { ACCENT_COLORS, accentColor } from './unifi.js';

describe('accentColor', () => {
    it('returns first color for index 1', () => {
        expect(accentColor(1)).toBe(ACCENT_COLORS[0]);
    });

    it('wraps around when index exceeds color array length', () => {
        expect(accentColor(ACCENT_COLORS.length + 1)).toBe(ACCENT_COLORS[0]);
    });

    it('returns second color for index 2', () => {
        expect(accentColor(2)).toBe(ACCENT_COLORS[1]);
    });
});
