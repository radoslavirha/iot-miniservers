import { CircuitState } from '@radoslavirha/resilience';
import { describe, expect, it } from 'vitest';
import { breakerCheck } from './breakerCheck.js';
import { HealthStatus } from '../HealthStatus.enum.js';

// breakerCheck is synchronous by design — it reads a field, it does no I/O. Promise.resolve
// keeps the assertions uniform without implying the adapter returns a promise.
const evaluate = (state: CircuitState, critical?: boolean) =>
    Promise.resolve(
        breakerCheck('upstream', { state }, critical === undefined ? {} : { critical })
            .check(new AbortController().signal)
    );

describe('breakerCheck', () => {
    describe('State mapping', () => {
        it('Should map Closed to pass with no detail', async () => {
            await expect(evaluate(CircuitState.Closed)).resolves.toEqual({ status: HealthStatus.Pass });
        });

        it('Should map Open to fail', async () => {
            await expect(evaluate(CircuitState.Open)).resolves.toEqual({
                status: HealthStatus.Fail,
                detail: 'circuit-open'
            });
        });

        // Recovering, not down — a probe request is being let through.
        it('Should map HalfOpen to warn', async () => {
            await expect(evaluate(CircuitState.HalfOpen)).resolves.toEqual({
                status: HealthStatus.Warn,
                detail: 'circuit-half-open'
            });
        });

        it('Should map Isolated to fail', async () => {
            await expect(evaluate(CircuitState.Isolated)).resolves.toEqual({
                status: HealthStatus.Fail,
                detail: 'circuit-isolated'
            });
        });

        it('Should warn rather than fail on an unrecognised state', async () => {
            await expect(evaluate(99 as CircuitState)).resolves.toEqual({
                status: HealthStatus.Warn,
                detail: 'circuit-unknown'
            });
        });

        // The detail is for a human reading /health — never `circuit-1`.
        it('Should never put a numeric state in the detail', async () => {
            const results = await Promise.all(
                [CircuitState.Open, CircuitState.HalfOpen, CircuitState.Isolated].map((state) => evaluate(state))
            );

            for (const result of results) {
                expect(result.detail).not.toMatch(/\d/);
            }
        });

        /**
         * Guards the mapping against a cockatiel renumbering. The table is keyed off the
         * real enum, so this asserts every member is covered rather than that specific
         * numbers mean specific things.
         */
        it('Should map every CircuitState member', async () => {
            const members = Object.values(CircuitState).filter((v): v is CircuitState => typeof v === 'number');

            const results = await Promise.all(members.map((state) => evaluate(state)));

            expect(results.every((result) => result.detail !== 'circuit-unknown')).toBe(true);
        });
    });

    describe('Criticality', () => {
        it('Should default to non-critical', () => {
            expect(breakerCheck('upstream', { state: CircuitState.Closed }).critical).toBe(false);
        });

        it('Should honour an explicit critical flag', () => {
            expect(breakerCheck('upstream', { state: CircuitState.Closed }, { critical: true }).critical).toBe(true);
        });
    });

    describe('Passivity', () => {
        it('Should read the breaker on every call rather than capturing the state once', () => {
            const breaker = { state: CircuitState.Closed };
            const health = breakerCheck('upstream', breaker);

            expect(health.check(new AbortController().signal)).toMatchObject({ status: HealthStatus.Pass });

            breaker.state = CircuitState.Open;

            expect(health.check(new AbortController().signal)).toMatchObject({ status: HealthStatus.Fail });
        });
    });
});
