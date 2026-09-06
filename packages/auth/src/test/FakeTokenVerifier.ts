import type { Credential, ITokenVerifier } from '../ITokenVerifier.js';
import type { Principal } from '../Principal.js';
import { VerificationReason, type VerificationOutcome } from '../VerificationOutcome.js';

/**
 * An `ITokenVerifier` that returns whatever it was told to.
 *
 * P1.5's guard has to be tested against every outcome — including
 * `indeterminate`, which a real verifier only produces when its key source is
 * unreachable, and which is therefore close to impossible to trigger honestly.
 * Faking the verifier tests the guard; faking the network tests the network.
 *
 * It records the credentials it was handed, so a test can assert that the guard
 * extracted the header it claims to extract.
 */
export class FakeTokenVerifier implements ITokenVerifier {
    /** Every credential passed to `verify`, in order. */
    readonly seen: Credential[] = [];

    #outcome: VerificationOutcome;

    constructor(outcome: VerificationOutcome = successOutcome()) {
        this.#outcome = outcome;
    }

    verify(credential: Credential): Promise<VerificationOutcome> {
        this.seen.push(credential);
        return Promise.resolve(this.#outcome);
    }

    /** Changes what the next `verify` returns, mid-test. */
    willReturn(outcome: VerificationOutcome): this {
        this.#outcome = outcome;
        return this;
    }
}

/** A verified outcome carrying a plausible human principal. */
export const successOutcome = (principal: Partial<Principal> = {}): VerificationOutcome => ({
    reason: VerificationReason.Ok,
    principal: {
        subject: 'test-subject',
        kind: 'human',
        displayName: 'Test User',
        roles: [],
        issuer: 'https://issuer.test/',
        ...principal
    }
});

/** A failed outcome, for any reason other than `ok`. */
export const failureOutcome = (
    reason: Exclude<VerificationReason, typeof VerificationReason.Ok>,
    detail?: string
): VerificationOutcome => ({ reason, detail });
