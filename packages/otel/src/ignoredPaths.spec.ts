import { describe, expect, it } from 'vitest';
import { IGNORED_TRACE_PATHS, isIgnoredTracePath } from './ignoredPaths.js';

describe('isIgnoredTracePath', () => {
    describe('Probe endpoints', () => {
        it.each([
            '/health',
            '/health/live',
            '/health/ready',
            '/healthz'
        ])('Should ignore %s', (url) => {
            expect(isIgnoredTracePath(url)).toBe(true);
        });

        it('Should ignore a probe path carrying a query string', () => {
            expect(isIgnoredTracePath('/health/ready?verbose=1')).toBe(true);
        });

        it('Should ignore a probe path carrying a fragment', () => {
            expect(isIgnoredTracePath('/health#anchor')).toBe(true);
        });
    });

    describe('Real traffic', () => {
        it.each([
            '/',
            '/v1/devices',
            '/qr/x7k2',
            '/doc'
        ])('Should trace %s', (url) => {
            expect(isIgnoredTracePath(url)).toBe(false);
        });

        // The reason for anchoring on a segment boundary rather than a bare startsWith:
        // an unrelated route with a health-ish prefix must keep its spans.
        it.each([
            '/healthchecks-admin',
            '/healthz-internal',
            '/healthy'
        ])('Should trace %s despite the prefix', (url) => {
            expect(isIgnoredTracePath(url)).toBe(false);
        });

        it('Should trace a nested path that only mentions health later', () => {
            expect(isIgnoredTracePath('/v1/health')).toBe(false);
        });
    });

    describe('Edge cases', () => {
        it('Should not ignore an undefined url', () => {
            expect(isIgnoredTracePath(undefined)).toBe(false);
        });

        it('Should not ignore an empty url', () => {
            expect(isIgnoredTracePath('')).toBe(false);
        });

        it('Should be case-sensitive, as paths are', () => {
            expect(isIgnoredTracePath('/Health/live')).toBe(false);
        });
    });

    describe('IGNORED_TRACE_PATHS', () => {
        it('Should cover the Ts.ED APIs and the nginx UIs', () => {
            expect([...IGNORED_TRACE_PATHS]).toEqual(['/health', '/healthz']);
        });
    });
});
