import { metrics } from '@opentelemetry/api';
import { CommonUtils } from '@radoslavirha/utils';
import type { Counter, MeterProvider } from '@opentelemetry/api';
import type { VerificationReason } from './VerificationOutcome.js';

export const AUTH_METER_NAME = 'auth';

/**
 * Verification outcomes, labelled by reason.
 *
 * The standing question this answers is "who is being turned away, and why" —
 * a rate of `invalid` that starts at a deploy is a broken caller, a rate of
 * `indeterminate` is our own IdP. Neither is visible in a boot-time log line.
 */
export const METRIC_AUTH_VERIFICATIONS = 'auth.verifications';

export const ATTR_AUTH_OUTCOME = 'auth.outcome';
export const ATTR_AUTH_ISSUER = 'auth.issuer';

interface AuthInstruments {
    readonly verifications: Counter;
}

/**
 * Instruments, built once per meter provider.
 *
 * The metrics API has **no proxy provider**, unlike the trace API:
 * `metrics.getMeter()` resolves against whatever is registered *at call time*,
 * and an instrument created before the SDK starts is bound to the no-op
 * provider forever. Building these in a constructor would therefore silently
 * disable every auth metric depending on construction order. Keying the cache
 * on the provider fixes it in both directions — no-op instruments are discarded
 * the moment a real provider registers — and keeps the hot path to one
 * `WeakMap` lookup.
 */
const instrumentsByProvider = new WeakMap<MeterProvider, AuthInstruments>();

const authInstruments = (): AuthInstruments => {
    const provider = metrics.getMeterProvider();
    const cached = instrumentsByProvider.get(provider);
    if (cached) {
        return cached;
    }

    const meter = metrics.getMeter(AUTH_METER_NAME);
    const created: AuthInstruments = {
        verifications: meter.createCounter(METRIC_AUTH_VERIFICATIONS, {
            description: 'Credential verification outcomes, by reason.',
            unit: '{verification}'
        })
    };

    instrumentsByProvider.set(provider, created);
    return created;
};

/**
 * Counts one verification outcome.
 *
 * The `reason` values are `VerificationReason`'s own strings, used verbatim —
 * the same vocabulary the logs and the HTTP status mapping use. Three units
 * inventing three spellings is what P1.0 fixed them to prevent.
 *
 * `issuer` is included only when one matched. An unknown issuer would otherwise
 * let anybody create unbounded label values by sending tokens with made-up
 * `iss` claims, which is a cardinality bomb aimed straight at the metrics
 * backend.
 */
export const recordVerification = (reason: VerificationReason, issuer?: string): void => {
    authInstruments().verifications.add(1, {
        [ATTR_AUTH_OUTCOME]: reason,
        ...(CommonUtils.isUndefined(issuer) ? {} : { [ATTR_AUTH_ISSUER]: issuer })
    });
};
