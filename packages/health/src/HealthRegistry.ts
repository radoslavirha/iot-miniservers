import { MAX_DETAIL_LENGTH, type HealthCheck, type HealthCheckResult, type HealthReport } from './HealthCheck.js';
import { buildReport, isReady, type EvaluatedCheck } from './report.js';
import { HealthConfigSchema, type HealthConfig, type ResolvedHealthConfig } from './schemas/health.schema.js';
import { HealthStatus } from './HealthStatus.enum.js';

/** Outcome of one evaluation pass, shared by `/health` and `/health/ready`. */
export interface HealthEvaluation {
    readonly ready: boolean;
    readonly evaluated: readonly EvaluatedCheck[];
}

const truncate = (detail: string): string =>
    detail.length <= MAX_DETAIL_LENGTH ? detail : detail.slice(0, MAX_DETAIL_LENGTH);

const sanitise = (result: HealthCheckResult): HealthCheckResult => ({
    status: result.status,
    ...(result.detail === undefined ? {} : { detail: truncate(result.detail) }),
    ...(result.observedValue === undefined ? {} : { observedValue: result.observedValue })
});

/**
 * Evaluates registered health checks: concurrently, each under its own deadline, with
 * results reused for a short window.
 *
 * Three invariants the rest of the design leans on:
 *
 * 1. **`evaluate()` never rejects.** A check that throws or hangs becomes a `fail` for
 *    that check alone; the others still report. A probe that receives no body is a probe
 *    that tells you nothing.
 * 2. **A thrown error never reaches the body.** Only `error.name` is surfaced, never
 *    `error.message` — a mongoose connection error's message embeds the connection URI.
 *    Enforced here rather than trusted to each check, which is the difference between a
 *    convention and a guarantee.
 * 3. **Checks run concurrently.** Wall time is the slowest check, not the sum, so three
 *    2 s checks cannot blow past a 3 s `readinessProbe.timeoutSeconds`.
 */
export class HealthRegistry {
    private readonly config: ResolvedHealthConfig;
    private readonly checks: readonly HealthCheck[];

    /** In-flight evaluation, shared by concurrent callers (single-flight). */
    private inFlight?: Promise<HealthEvaluation>;
    private cached?: { at: number; value: HealthEvaluation };

    public constructor(checks: readonly HealthCheck[] = [], config: HealthConfig = {}) {
        this.checks = checks;
        this.config = HealthConfigSchema.parse(config);
    }

    /**
     * Evaluates every registered check, reusing a recent or in-flight result when one is
     * available. An empty registry is legal and reports `pass`.
     */
    public async evaluate(): Promise<HealthEvaluation> {
        const now = Date.now();

        if (this.cached && now - this.cached.at < this.config.cacheTtlMs) {
            return this.cached.value;
        }

        // Single-flight: three probes plus a human on /health would otherwise each start
        // their own pass over the same checks.
        this.inFlight ??= this.runAll().then((value) => {
            this.cached = { at: Date.now(), value };
            this.inFlight = undefined;
            return value;
        });

        return this.inFlight;
    }

    /** Full report, including the per-check breakdown unless `exposeDetail` is off. */
    public async report(): Promise<HealthReport> {
        const { evaluated } = await this.evaluate();
        return buildReport(evaluated, this.config.exposeDetail);
    }

    private async runAll(): Promise<HealthEvaluation> {
        const evaluated = await Promise.all(this.checks.map((check) => this.runOne(check)));
        return { ready: isReady(evaluated), evaluated };
    }

    private async runOne(check: HealthCheck): Promise<EvaluatedCheck> {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.config.checkTimeoutMs);

        try {
            const result = await Promise.race([
                Promise.resolve(check.check(controller.signal)),
                this.deadline(controller.signal)
            ]);

            return { check, result: sanitise(result) };
        } catch (error) {
            // Name only — a message may carry a connection URI or credentials.
            const name = error instanceof Error ? error.name : 'Error';
            return { check, result: { status: HealthStatus.Fail, detail: truncate(name) } };
        } finally {
            clearTimeout(timer);
        }
    }

    /** Resolves to a `fail` — never rejects — when the per-check deadline expires. */
    private deadline(signal: AbortSignal): Promise<HealthCheckResult> {
        return new Promise((resolve) => {
            const onAbort = (): void => resolve({ status: HealthStatus.Fail, detail: 'timeout' });

            if (signal.aborted) {
                onAbort();
                return;
            }

            signal.addEventListener('abort', onAbort, { once: true });
        });
    }
}
