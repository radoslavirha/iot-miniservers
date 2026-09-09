import { describe, expect, it } from 'vitest';
import { FakeTokenVerifier, failureOutcome, successOutcome } from './FakeTokenVerifier.js';
import { VerificationReason } from '../VerificationOutcome.js';

describe('FakeTokenVerifier', () => {
    it('returns a successful outcome by default', async () => {
        const outcome = await new FakeTokenVerifier().verify('anything');

        expect(outcome.reason).toBe(VerificationReason.Ok);
        expect(outcome).toHaveProperty('principal.subject', 'test-subject');
    });

    it('records every credential it was handed, in order', async () => {
        const verifier = new FakeTokenVerifier();

        await verifier.verify('first');
        await verifier.verify('second');

        expect(verifier.seen).toEqual(['first', 'second']);
    });

    it('returns the outcome it was constructed with', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.WrongAudience, 'aud was other'));

        const outcome = await verifier.verify('t');

        expect(outcome).toEqual({ reason: 'wrong-audience', detail: 'aud was other' });
    });

    it('can be retargeted mid-test', async () => {
        const verifier = new FakeTokenVerifier();

        const before = await verifier.verify('t');
        verifier.willReturn(failureOutcome(VerificationReason.Invalid));
        const after = await verifier.verify('t');

        expect(before.reason).toBe(VerificationReason.Ok);
        expect(after.reason).toBe(VerificationReason.Invalid);
    });

    it('can produce indeterminate, which a real verifier only reaches via an unreachable key source', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'JWKS timeout'));

        expect((await verifier.verify('t')).reason).toBe('indeterminate');
    });
});

describe('successOutcome', () => {
    it('overrides only what it is given', () => {
        const outcome = successOutcome({ kind: 'service', roles: ['reader'] });

        expect(outcome).toEqual({
            reason: 'ok',
            principal: {
                subject: 'test-subject',
                kind: 'service',
                displayName: 'Test User',
                roles: ['reader'],
                issuer: 'https://issuer.test/'
            }
        });
    });
});

describe('failureOutcome', () => {
    it('omits detail when none is given', () => {
        expect(failureOutcome(VerificationReason.Missing)).toEqual({ reason: 'missing', detail: undefined });
    });
});
