import { describe, expect, it } from 'vitest';
import { NoAuthStrategy } from './NoAuthStrategy.js';

describe('NoAuthStrategy', () => {
    it('returns empty credentials', async () => {
        const strategy = new NoAuthStrategy();
        const creds = await strategy.getCredentials();
        expect(creds).toEqual({});
    });

    it('invalidate() is a no-op', () => {
        const strategy = new NoAuthStrategy();
        expect(() => strategy.invalidate()).not.toThrow();
    });
});
