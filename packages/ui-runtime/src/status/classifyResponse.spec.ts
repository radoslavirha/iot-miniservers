import { describe, expect, it } from 'vitest';
import { classifyError, classifyResponse } from './classifyResponse.js';
import { statusForOutcome } from './ApiStatus.js';

describe('classifyResponse', () => {
    it.each([200, 201, 204, 304])('treats %i as success', (status) => {
        expect(classifyResponse({ status })).toEqual({ kind: 'success' });
    });

    it.each([400, 401, 404, 422, 499])('treats %i as a client error', (status) => {
        expect(classifyResponse({ status })).toEqual({ kind: 'client-error', status });
    });

    it.each([500, 502, 503])('treats %i as a server error', (status) => {
        expect(classifyResponse({ status })).toEqual({ kind: 'server-error', status });
    });
});

describe('classifyError', () => {
    it('is always a network outcome', () => {
        expect(classifyError()).toEqual({ kind: 'network' });
    });
});

describe('statusForOutcome', () => {
    it('maps a client error to ok — the backend answered', () => {
        expect(statusForOutcome({ kind: 'client-error', status: 422 })).toBe('ok');
    });

    it('maps a server error to degraded', () => {
        expect(statusForOutcome({ kind: 'server-error', status: 503 })).toBe('degraded');
    });

    it('maps a network failure to unreachable', () => {
        expect(statusForOutcome({ kind: 'network' })).toBe('unreachable');
    });
});
