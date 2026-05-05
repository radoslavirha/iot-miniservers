import { describe, expect, it, vi, beforeEach } from 'vitest';
import { KubernetesServiceAccountStrategy } from './KubernetesServiceAccountStrategy.js';
import type { KubernetesServiceAccountAuth } from '../schemas/auth.schema.js';
import { AuthStrategy } from '../schemas/auth.schema.js';

vi.mock('node:fs/promises', () => ({
    readFile: vi.fn()
}));

import { readFile } from 'node:fs/promises';

const DEFAULT_CONFIG: KubernetesServiceAccountAuth = {
    strategy: AuthStrategy.KubernetesServiceAccount,
    tokenPath: '/var/run/secrets/kubernetes.io/serviceaccount/token',
    transport: { headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }] }
};

describe('KubernetesServiceAccountStrategy', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reads token from the configured path', async () => {
        vi.mocked(readFile).mockResolvedValue('my-sa-token\n' as never);
        const strategy = new KubernetesServiceAccountStrategy(DEFAULT_CONFIG);
        const creds = await strategy.getCredentials();
        expect(creds).toEqual({ value: 'my-sa-token' });
        expect(readFile).toHaveBeenCalledWith(DEFAULT_CONFIG.tokenPath, 'utf-8');
    });

    it('reads token fresh on every call', async () => {
        vi.mocked(readFile)
            .mockResolvedValueOnce('token-v1' as never)
            .mockResolvedValueOnce('token-v2' as never);
        const strategy = new KubernetesServiceAccountStrategy(DEFAULT_CONFIG);
        const first = await strategy.getCredentials();
        const second = await strategy.getCredentials();
        expect(first).toEqual({ value: 'token-v1' });
        expect(second).toEqual({ value: 'token-v2' });
        expect(readFile).toHaveBeenCalledTimes(2);
    });

    it('invalidate() is a no-op', () => {
        const strategy = new KubernetesServiceAccountStrategy(DEFAULT_CONFIG);
        expect(() => strategy.invalidate()).not.toThrow();
    });

    it('trims whitespace from token', async () => {
        vi.mocked(readFile).mockResolvedValue('  spaced-token  \n' as never);
        const strategy = new KubernetesServiceAccountStrategy(DEFAULT_CONFIG);
        const creds = await strategy.getCredentials();
        expect(creds['value']).toBe('spaced-token');
    });
});
