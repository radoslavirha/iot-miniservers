import { describe, expect, it } from 'vitest';
import { classifyError, classifyResponse } from './classifyResponse.js';
import { statusForOutcome } from './ApiStatus.js';

describe('classifyResponse', () => {
    it.each([200, 201, 204, 304])('treats %i as success', (status) => {
        expect(classifyResponse({ status })).toEqual({ kind: 'success' });
    });

    it.each([400, 404, 422, 499])('treats %i as a client error', (status) => {
        expect(classifyResponse({ status })).toEqual({ kind: 'client-error', status });
    });

    it.each([401, 403])('treats %i as unauthorized, not an ordinary client error', (status) => {
        // Folded in with the other 4xx these map to `ok`, which is how an
        // expired session showed a healthy banner over an app that could no
        // longer load anything.
        expect(classifyResponse({ status })).toEqual({ kind: 'unauthorized', status });
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

    it('maps unauthorized to unauthenticated, never to ok', () => {
        // The defect this exists to prevent: nothing the user types fixes a 401,
        // so reporting the backend as healthy leaves them with no way to know
        // their session ended.
        expect(statusForOutcome({ kind: 'unauthorized', status: 401 })).toBe('unauthenticated');
        expect(statusForOutcome({ kind: 'unauthorized', status: 403 })).toBe('unauthenticated');
    });

    it('maps a server error to degraded', () => {
        expect(statusForOutcome({ kind: 'server-error', status: 503 })).toBe('degraded');
    });

    it('maps a network failure to unreachable', () => {
        expect(statusForOutcome({ kind: 'network' })).toBe('unreachable');
    });
});
