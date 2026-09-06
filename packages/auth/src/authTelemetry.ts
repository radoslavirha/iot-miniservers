import { metrics } from '@opentelemetry/api';
import type { Counter, MeterProvider, ObservableGauge } from '@opentelemetry/api';
import { AuthMode } from './AuthMode.js';
import type { VerificationReason } from './VerificationOutcome.js';

export const AUTH_METER_NAME = 'auth';

/**
 * Which mode the service is running in, as `0` / `1` / `2`.
 *
 * A gauge rather than a log line because the alert this exists for is a
 * *standing* question — "is any production app still not enforcing?" — which a
 * boot-time message cannot answer an hour later.
 */
export const METRIC_AUTH_MODE = 'auth.mode';

/**
 * Verification outcomes, labelled by reason.
 *
 * This is what makes `permissive` more than a slogan: turn it on in production,
 * watch for `missing` and `invalid`, find the caller nobody remembered, then
 * flip to `enforced`.
 */
export const METRIC_AUTH_VERIFICATIONS = 'auth.verifications';

export const ATTR_AUTH_OUTCOME = 'auth.outcome';
export const ATTR_AUTH_ISSUER = 'auth.issuer';

/**
 * Numeric encoding of the mode, ordered by how much it enforces, so an alert
 * can be written as `auth_mode < 2`.
 */
export const AUTH_MODE_VALUE: Readonly<Record<AuthMode, number>> = {
    [AuthMode.Disabled]: 0,
    [AuthMode.Permissive]: 1,
    [AuthMode.Enforced]: 2
};

interface AuthInstruments {
    readonly verifications: Counter;
    readonly mode: ObservableGauge;
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
        }),
        mode: meter.createObservableGauge(METRIC_AUTH_MODE, {
            description: 'Authentication mode: 0 disabled, 1 permissive, 2 enforced.'
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
        ...(issuer === undefined ? {} : { [ATTR_AUTH_ISSUER]: issuer })
    });
};

/**
 * Publishes the current mode as a gauge.
 *
 * Returns a function that stops publishing, so a test or a shutdown path can
 * detach the callback rather than leaking it into the next provider.
 */
export const observeAuthMode = (mode: AuthMode): (() => void) => {
    const { mode: gauge } = authInstruments();
    const callback = (result: { observe: (value: number) => void }) => {
        result.observe(AUTH_MODE_VALUE[mode]);
    };

    gauge.addCallback(callback);
    return () => {
        gauge.removeCallback(callback);
    };
};
