import { describe, expect, it, vi } from 'vitest';
import { HealthRegistry } from './HealthRegistry.js';
import type { HealthCheck, HealthCheckResult } from './HealthCheck.js';
import { HealthStatus } from './HealthStatus.enum.js';

const check = (
    name: string,
    critical: boolean,
    status: HealthStatus,
    detail?: string
): HealthCheck => ({
    name,
    critical,
    check: (): HealthCheckResult => (detail === undefined ? { status } : { status, detail })
});

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('HealthRegistry', () => {
    describe('Roll-up and readiness', () => {
        it('Should report pass and ready for an empty registry', async () => {
            const registry = new HealthRegistry();

            const { ready } = await registry.evaluate();

            expect(ready).toBe(true);
            await expect(registry.report()).resolves.toEqual({ status: HealthStatus.Pass, checks: {} });
        });

        it('Should report fail and not ready when a critical check fails', async () => {
            const registry = new HealthRegistry([check('mongodb', true, HealthStatus.Fail, 'disconnected')]);

            const { ready } = await registry.evaluate();

            expect(ready).toBe(false);
            await expect(registry.report()).resolves.toEqual({
                status: HealthStatus.Fail,
                checks: { mongodb: { status: HealthStatus.Fail, detail: 'disconnected' } }
            });
        });

        // The load-bearing case: an upstream outage must not remove this pod from Endpoints.
        it('Should report warn but stay ready when a non-critical check fails', async () => {
            const registry = new HealthRegistry([check('chmi-portal', false, HealthStatus.Fail, 'circuit-open')]);

            const { ready } = await registry.evaluate();

            expect(ready).toBe(true);
            await expect(registry.report()).resolves.toMatchObject({ status: HealthStatus.Warn });
        });

        it('Should report warn and stay ready for a critical pass plus a non-critical fail', async () => {
            const registry = new HealthRegistry([
                check('mongodb', true, HealthStatus.Pass),
                check('chmi-portal', false, HealthStatus.Fail)
            ]);

            const { ready } = await registry.evaluate();

            expect(ready).toBe(true);
            await expect(registry.report()).resolves.toMatchObject({ status: HealthStatus.Warn });
        });

        it('Should report warn and stay ready when a critical check warns', async () => {
            const registry = new HealthRegistry([check('mqtt', true, HealthStatus.Warn)]);

            const { ready } = await registry.evaluate();

            expect(ready).toBe(true);
            await expect(registry.report()).resolves.toMatchObject({ status: HealthStatus.Warn });
        });
    });

    describe('Failure isolation', () => {
        it('Should fail only the timed-out check and still report the others', async () => {
            const hanging: HealthCheck = {
                name: 'slow',
                critical: true,
                check: async () => {
                    await sleep(5000);
                    return { status: HealthStatus.Pass };
                }
            };
            const registry = new HealthRegistry([hanging, check('fast', true, HealthStatus.Pass)], {
                checkTimeoutMs: 20,
                cacheTtlMs: 0
            });

            const report = await registry.report();

            expect(report).toEqual({
                status: HealthStatus.Fail,
                checks: {
                    slow: { status: HealthStatus.Fail, detail: 'timeout' },
                    fast: { status: HealthStatus.Pass }
                }
            });
        });

        it('Should abort the signal passed to a check when the deadline expires', async () => {
            let aborted = false;
            const observing: HealthCheck = {
                name: 'observing',
                critical: false,
                check: async (signal) => {
                    signal.addEventListener('abort', () => {
                        aborted = true; 
                    });
                    await sleep(200);
                    return { status: HealthStatus.Pass };
                }
            };
            const registry = new HealthRegistry([observing], { checkTimeoutMs: 10, cacheTtlMs: 0 });

            await registry.evaluate();

            expect(aborted).toBe(true);
        });

        // A mongoose connection error embeds the connection URI in its message.
        it('Should surface only the error name, never the message, when a check throws', async () => {
            const secret = 'mongodb://user:hunter2@mongo.internal:27017/db';
            const throwing: HealthCheck = {
                name: 'mongodb',
                critical: true,
                check: () => {
                    const error = new Error(`connect ECONNREFUSED ${secret}`);
                    error.name = 'MongooseServerSelectionError';
                    throw error;
                }
            };
            const registry = new HealthRegistry([throwing]);

            const report = await registry.report();

            expect(report.checks?.mongodb).toEqual({
                status: HealthStatus.Fail,
                detail: 'MongooseServerSelectionError'
            });
            expect(JSON.stringify(report)).not.toContain(secret);
            expect(JSON.stringify(report)).not.toContain('hunter2');
        });

        it('Should report Error for a non-Error throwable', async () => {
            const throwing: HealthCheck = {
                name: 'odd',
                critical: true,
                check: () => {
                    throw 'a string'; 
                }
            };
            const registry = new HealthRegistry([throwing]);

            const report = await registry.report();

            expect(report.checks?.odd).toEqual({ status: HealthStatus.Fail, detail: 'Error' });
        });

        it('Should truncate detail longer than 120 characters', async () => {
            const registry = new HealthRegistry([check('verbose', false, HealthStatus.Warn, 'x'.repeat(200))]);

            const report = await registry.report();

            expect(report.checks?.verbose?.detail).toHaveLength(120);
        });

        it('Should never reject, whatever the checks do', async () => {
            const registry = new HealthRegistry([
                { name: 'throws', critical: true, check: () => {
                    throw new Error('boom'); 
                } },
                { name: 'rejects', critical: true, check: () => Promise.reject(new Error('boom')) }
            ]);

            await expect(registry.evaluate()).resolves.toBeDefined();
        });
    });

    describe('Concurrency and caching', () => {
        // Serial evaluation of three 2s checks would blow past readinessProbe.timeoutSeconds.
        it('Should run checks concurrently, not serially', async () => {
            const slow = (name: string): HealthCheck => ({
                name,
                critical: false,
                check: async () => {
                    await sleep(100);
                    return { status: HealthStatus.Pass };
                }
            });
            const registry = new HealthRegistry([slow('a'), slow('b'), slow('c')], {
                checkTimeoutMs: 1000,
                cacheTtlMs: 0
            });

            const started = Date.now();
            await registry.evaluate();
            const elapsed = Date.now() - started;

            expect(elapsed).toBeLessThan(250);
        });

        it('Should reuse a cached result inside the TTL', async () => {
            const spy = vi.fn().mockReturnValue({ status: HealthStatus.Pass });
            const registry = new HealthRegistry(
                [{ name: 'counted', critical: true, check: spy }],
                { cacheTtlMs: 5000 }
            );

            await registry.evaluate();
            await registry.evaluate();
            await registry.report();

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('Should re-evaluate once the TTL has expired', async () => {
            const spy = vi.fn().mockReturnValue({ status: HealthStatus.Pass });
            const registry = new HealthRegistry(
                [{ name: 'counted', critical: true, check: spy }],
                { cacheTtlMs: 10 }
            );

            await registry.evaluate();
            await sleep(30);
            await registry.evaluate();

            expect(spy).toHaveBeenCalledTimes(2);
        });

        it('Should share one evaluation between concurrent callers (single-flight)', async () => {
            const spy = vi.fn().mockImplementation(async () => {
                await sleep(50);
                return { status: HealthStatus.Pass };
            });
            const registry = new HealthRegistry(
                [{ name: 'counted', critical: true, check: spy }],
                { cacheTtlMs: 0 }
            );

            await Promise.all([registry.evaluate(), registry.evaluate(), registry.report()]);

            expect(spy).toHaveBeenCalledTimes(1);
        });

        it('Should re-evaluate every call when the TTL is zero', async () => {
            const spy = vi.fn().mockReturnValue({ status: HealthStatus.Pass });
            const registry = new HealthRegistry(
                [{ name: 'counted', critical: true, check: spy }],
                { cacheTtlMs: 0 }
            );

            await registry.evaluate();
            await registry.evaluate();

            expect(spy).toHaveBeenCalledTimes(2);
        });
    });

    describe('Body shape', () => {
        it('Should omit the checks key entirely when exposeDetail is false', async () => {
            const registry = new HealthRegistry([check('mongodb', true, HealthStatus.Pass)], {
                exposeDetail: false
            });

            const report = await registry.report();

            expect(report).toEqual({ status: HealthStatus.Pass });
            expect(report).not.toHaveProperty('checks');
        });

        it('Should emit no field other than status, detail and observedValue', async () => {
            const registry = new HealthRegistry([
                {
                    name: 'mongodb',
                    critical: true,
                    check: () => ({ status: HealthStatus.Pass, observedValue: 12 })
                }
            ]);

            const report = await registry.report();

            expect(Object.keys(report).sort()).toEqual(['checks', 'status']);
            expect(Object.keys(report.checks!.mongodb).sort()).toEqual(['observedValue', 'status']);
        });

        it('Should strip unknown fields a check adds to its result', async () => {
            const registry = new HealthRegistry([
                {
                    name: 'leaky',
                    critical: false,
                    check: () => ({ status: HealthStatus.Pass, host: 'mongo.internal' } as never)
                }
            ]);

            const report = await registry.report();

            expect(report.checks?.leaky).toEqual({ status: HealthStatus.Pass });
        });
    });

    describe('Configuration', () => {
        it('Should apply defaults for an empty config', async () => {
            const registry = new HealthRegistry([check('a', true, HealthStatus.Pass)], {});

            await expect(registry.report()).resolves.toMatchObject({ status: HealthStatus.Pass });
        });

        it('Should reject an invalid config', () => {
            expect(() => new HealthRegistry([], { checkTimeoutMs: 0 })).toThrow();
        });
    });
});
