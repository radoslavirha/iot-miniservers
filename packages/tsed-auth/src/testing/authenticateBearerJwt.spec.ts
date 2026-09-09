import { describe, expect, it, vi } from 'vitest';
import { authenticateBearerJwt } from './authenticateBearerJwt.js';

/** Decodes a JWT payload without pulling `jose` in for one assertion. */
const payloadOf = (header: string): Record<string, unknown> => {
    const [, body] = header.slice('Bearer '.length).split('.');
    return JSON.parse(Buffer.from(body ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
};

/** Stands in for a SuperTest agent, whose `set` records a persistent header. */
const fakeAgent = () => {
    const headers: Record<string, string> = {};
    return {
        headers,
        agent: {
            set: vi.fn((field: string, value: string) => {
                headers[field] = value;
                return undefined;
            })
        }
    };
};

describe('authenticateBearerJwt', () => {
    it('sets one persistent header, which is what the agent already supports', async () => {
        // No proxy, no wrapper: `SuperTest.agent(app).set(…)` applies to every
        // request the agent makes. Reimplementing that was this file's old job.
        const { agent, headers } = fakeAgent();

        await authenticateBearerJwt(agent);

        expect(agent.set).toHaveBeenCalledTimes(1);
        expect(headers['Authorization']).toMatch(/^Bearer /);
    });

    it('mints a valid token so a suite needs no token variable', async () => {
        const { agent, headers } = fakeAgent();

        await authenticateBearerJwt(agent);

        // The defaults a service's `config/test.json` inline row is copied from.
        expect(payloadOf(headers['Authorization'] ?? '')['aud']).toBe('test-audience');
    });

    it('varies the caller when asked', async () => {
        const { agent, headers } = fakeAgent();

        await authenticateBearerJwt(agent, { subject: 'someone' });

        expect(payloadOf(headers['Authorization'] ?? '')['sub']).toBe('someone');
    });

    it('returns the same agent, so it reads as a one-line setup step', async () => {
        const { agent } = fakeAgent();

        expect(await authenticateBearerJwt(agent)).toBe(agent);
    });
});
