import { describe, expect, it } from 'vitest';
import { buildReport, isReady, rollUp, type EvaluatedCheck } from './report.js';

import { HealthStatus } from './HealthStatus.enum.js';

const evaluated = (name: string, critical: boolean, status: HealthStatus): EvaluatedCheck => ({
    check: { name, critical },
    result: { status }
});

describe('report', () => {
    describe('isReady', () => {
        it('Should be ready for an empty set', () => {
            expect(isReady([])).toBe(true);
        });

        it('Should not be ready when a critical check fails', () => {
            expect(isReady([evaluated('mongodb', true, HealthStatus.Fail)])).toBe(false);
        });

        it('Should stay ready when a non-critical check fails', () => {
            expect(isReady([evaluated('upstream', false, HealthStatus.Fail)])).toBe(true);
        });

        it('Should stay ready when a critical check only warns', () => {
            expect(isReady([evaluated('mqtt', true, HealthStatus.Warn)])).toBe(true);
        });
    });

    describe('rollUp', () => {
        it('Should be pass for an empty set', () => {
            expect(rollUp([])).toBe(HealthStatus.Pass);
        });

        it('Should be pass when everything passes', () => {
            expect(rollUp([evaluated('a', true, HealthStatus.Pass), evaluated('b', false, HealthStatus.Pass)])).toBe(HealthStatus.Pass);
        });

        it('Should be fail when a critical check fails', () => {
            expect(rollUp([evaluated('a', true, HealthStatus.Fail), evaluated('b', false, HealthStatus.Pass)])).toBe(HealthStatus.Fail);
        });

        it('Should be warn when only a non-critical check fails', () => {
            expect(rollUp([evaluated('a', true, HealthStatus.Pass), evaluated('b', false, HealthStatus.Fail)])).toBe(HealthStatus.Warn);
        });

        it('Should be warn when any check warns', () => {
            expect(rollUp([evaluated('a', true, HealthStatus.Warn)])).toBe(HealthStatus.Warn);
        });

        // fail is reserved for critical failures, so /health can answer 200 while degraded.
        it('Should prefer fail over warn when both are present', () => {
            expect(rollUp([evaluated('a', true, HealthStatus.Fail), evaluated('b', false, HealthStatus.Warn)])).toBe(HealthStatus.Fail);
        });
    });

    describe('buildReport', () => {
        it('Should key checks by name', () => {
            const report = buildReport([evaluated('mongodb', true, HealthStatus.Pass)]);

            expect(report).toEqual({ status: HealthStatus.Pass, checks: { mongodb: { status: HealthStatus.Pass } } });
        });

        it('Should omit the checks key when detail is not exposed', () => {
            const report = buildReport([evaluated('mongodb', true, HealthStatus.Pass)], false);

            expect(report).toEqual({ status: HealthStatus.Pass });
            expect(report).not.toHaveProperty('checks');
        });

        it('Should emit an empty checks object for an empty set', () => {
            expect(buildReport([])).toEqual({ status: HealthStatus.Pass, checks: {} });
        });
    });
});
