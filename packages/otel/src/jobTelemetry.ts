import { metrics, type Attributes, type Counter, type Histogram, type MeterProvider, type Span } from '@opentelemetry/api';
import { CommonUtils } from '@radoslavirha/utils';
import { isPromiseLike, withEntryPointSpan } from './spanTracing.js';
import { getMeter } from './telemetry.js';

/**
 * Telemetry for **scheduled and background work** — a timer tick, a startup task, a future cron.
 * One call emits the span *and* the metrics, so the next job author gets both signals without
 * thinking about either.
 *
 * ### Why metrics are the primary signal here, not traces
 *
 * A cron is deterministic: it does the same thing every tick against the same inputs. Correlating
 * a log line to one exact iteration buys almost nothing, because a fault that recurs every tick
 * shows up in any of them. What an operator actually needs is *"is this job running, how long does
 * it take, and is it failing"* — a question that must be answerable at a glance, always-on, with
 * nobody opening Tempo. That is a metrics question.
 *
 * Traces stay for structure and the occasional deep dive, which is why they are head-sampled at
 * the call site. **Sampling must never reach the metrics**: {@link JobRunOptions.suppressTrace}
 * drops the span and the whole subtree underneath it, and records the duration and outcome
 * anyway. Metrics give the complete picture, traces give the rare detailed one.
 *
 * ### Naming: why `job.*` and not `faas.*`
 *
 * OpenTelemetry has **no** convention for a generic in-process scheduled job. The two nearest
 * neighbours were both considered and rejected:
 *
 * - **`faas.invocations` / `faas.invoke_duration`** describe a Function-as-a-Service invocation.
 *   Adopting them would claim FaaS semantics this process does not have — the conventions require
 *   `faas.trigger`, `faas.name` and `faas.invoked_provider`, none of which have an honest value
 *   for a `setTimeout` — and would collide with real Lambda/Cloud Run data if any ever lands in
 *   the same Prometheus, silently corrupting both. `faas.invoke_duration` is also a name the
 *   current spec would no longer mint (`{operation}.duration` says `faas.invoke.duration`); it is
 *   frozen for compatibility, and copying a grandfathered shape is a poor model for a new one.
 * - **`cicd.pipeline.run.*`** is the closest in *shape*, and the `.run.duration`-grouped-by-result
 *   idea is borrowed from it wholesale. Its entity is a CI pipeline with `cicd.pipeline.name` and
 *   `cicd.pipeline.run.id`, which an in-process timer is not.
 *
 * So `job.*` is a deliberate **repo-local namespace**, built to the general metric conventions
 * (hierarchical `{area}.{name}`, no units in the name, durations in seconds, plural noun for a
 * counter of countable things) and shaped like `cicd.pipeline.run.duration` so it converges
 * cheaply if OpenTelemetry ever standardises one.
 *
 * ### What is a job — and what is not
 *
 * A job is work **this process schedules for itself**: a timer, a startup task, a queue drain on a
 * cadence. Inbound request traffic is not a job, however it arrives. The UDP command listener
 * deliberately has no `job.*` metric: it is Loxone asking this service to do something, its rate
 * is set by a client rather than by a schedule, and filing it under `job.*` would wreck every
 * "is my cron running" panel that reads a rate off these instruments. If it ever needs a metric,
 * the honest shape is a consumer/`messaging.*` duration, not this.
 */

/** Instrumentation scope for every job metric. */
export const JOB_METER_NAME = 'job';

/**
 * Duration of one job run, in **seconds**. Histogram.
 *
 * Its `count` series is the run rate and its `job.run.outcome` split is the failure rate, so there
 * is deliberately **no separate executions counter** — that would be the same information twice,
 * free to drift apart.
 */
export const METRIC_JOB_RUN_DURATION = 'job.run.duration';

/**
 * Runs that did not happen. Counter.
 *
 * These have no duration, so they cannot live in the histogram — and they must be counted
 * somewhere, or a job whose every tick is skipped is indistinguishable from a job that is dead.
 */
export const METRIC_JOB_RUN_SKIPS = 'job.run.skips';

/**
 * Items handled inside job runs. Counter.
 *
 * Not redundant with the run histogram: a job that catches per-item faults and keeps going — the
 * normal shape for a poller — reports `success` for every run it ever makes, so the run-level
 * outcome alone would call a job healthy while every one of its devices is dead.
 */
export const METRIC_JOB_RUN_ITEMS = 'job.run.items';

/**
 * Job identity. **Must be a bounded, static set** — one value per job in the codebase, chosen at
 * author time. Never a device id, a topic or anything derived from data: every attribute value
 * here multiplies the series count of all three instruments.
 */
export const ATTR_JOB_NAME = 'job.name';

/** Whether the run itself completed or threw. */
export const ATTR_JOB_RUN_OUTCOME = 'job.run.outcome';

/** Why a run did not happen. */
export const ATTR_JOB_SKIP_REASON = 'job.skip.reason';

/** Whether one item inside a run was handled or faulted. */
export const ATTR_JOB_ITEM_OUTCOME = 'job.item.outcome';

export const JOB_OUTCOME_VALUE_SUCCESS = 'success';
export const JOB_OUTCOME_VALUE_FAILURE = 'failure';

/** Values of {@link ATTR_JOB_RUN_OUTCOME} and {@link ATTR_JOB_ITEM_OUTCOME}. */
export type JobOutcome = typeof JOB_OUTCOME_VALUE_SUCCESS | typeof JOB_OUTCOME_VALUE_FAILURE;

/** The schedule fired and there was no work to do. Proof of life for an idle job. */
export const JOB_SKIP_REASON_VALUE_NOTHING_DUE = 'nothing_due';

/**
 * The schedule fired while the previous run was still going, so this one was dropped.
 *
 * Only reachable for a **fixed-rate** job (`setInterval`, or an external scheduler). A
 * self-rescheduling chain — `setTimeout` re-armed in a `finally` after the work — arms exactly one
 * timer at a time and *cannot* overrun; it runs late instead. Nothing in this repo emits this
 * value today for exactly that reason; it is defined so the first fixed-rate job uses this name
 * rather than inventing another.
 */
export const JOB_SKIP_REASON_VALUE_OVERRUN = 'overrun';

/** Values of {@link ATTR_JOB_SKIP_REASON}. */
export type JobSkipReason = typeof JOB_SKIP_REASON_VALUE_NOTHING_DUE | typeof JOB_SKIP_REASON_VALUE_OVERRUN;

/**
 * Bucket boundaries for {@link METRIC_JOB_RUN_DURATION}, in seconds.
 *
 * The SDK default (`[0, 5, 10, 25, 50, …, 10000]`) is built for milliseconds and is actively
 * useless here: every job in this repo finishes inside one second, so all of them would land in
 * the first bucket and every quantile would read 0. These span 10ms to 5 minutes — a fast tick
 * through a slow cron — with resolution concentrated below 10s, which is where a poll tick and a
 * device timeout both live.
 */
export const JOB_RUN_DURATION_BUCKETS: readonly number[] = [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300];

export interface JobRunOptions {
    /**
     * The `job.name` attribute — a bounded, static identifier, `snake_case` by convention.
     * Also the default span name.
     */
    readonly name: string;
    /** Instrumentation scope for the span, named after the thing being run. */
    readonly tracer: string;
    /** Span name, when it should read differently from {@link name}. Must be low cardinality. */
    readonly spanName?: string;
    /**
     * Span attributes. **Span only** — metric attributes are fixed by this module on purpose, so
     * no call site can quietly put a device id on a metric and multiply its series count.
     */
    readonly attributes?: Attributes;
    /**
     * Head-sampling for the trace: `true` runs the job with tracing suppressed, emitting no span
     * and dropping every auto-instrumented span underneath instead of orphaning them.
     *
     * **Metrics are recorded either way.** That pairing is the entire point of this helper.
     */
    readonly suppressTrace?: boolean;
}

/** Handle passed to the job body. */
export interface JobRunContext {
    /** The run's span. Non-recording when the run is sampled out. */
    readonly span: Span;
    /**
     * Records `count` items handled with the given outcome.
     *
     * Call it for work the job does **per item and handles per item** — a device read that fails
     * without failing the tick. A job that simply throws on the first fault does not need this;
     * its run outcome already says so.
     */
    recordItem: (outcome: JobOutcome, count?: number) => void;
}

/**
 * Runs a scheduled job, emitting its span and its metrics from one call.
 *
 * The span is an entry point — a root, because a `setTimeout` callback inherits the context that
 * scheduled it and a self-rescheduling loop would otherwise chain every future tick onto the first
 * one and grow a single unbounded trace.
 *
 * Errors are recorded as `job.run.outcome=failure` and rethrown: instrumentation never swallows a
 * failure. Sync and async bodies are both handled — the duration covers the whole settlement.
 *
 * @example
 * await runJob(
 *     { name: JOB_POLL_DEVICE_PROPERTIES, tracer: POLLER_TRACER_NAME, suppressTrace: !traced },
 *     async ({ recordItem }) => {
 *         for (const device of due) recordItem(await this.poll(device));
 *     }
 * );
 */
export function runJob<T>(options: JobRunOptions, fn: (run: JobRunContext) => T): T {
    const startedAt = performance.now();

    return withEntryPointSpan(
        {
            name: options.spanName ?? options.name,
            tracer: options.tracer,
            attributes: options.attributes,
            suppress: options.suppressTrace
        },
        (span) => recordOnSettle(options.name, startedAt, span, fn)
    );
}

/**
 * Records a run that did not happen.
 *
 * No span, because nothing ran and an empty wrapper every interval is noise in Tempo — and no log
 * line either, because a skip that repeats every tick would be the loudest thing in the log while
 * saying nothing a counter does not. The counter *is* the signal: `nothing_due` ticking over is
 * how an idle job proves it is still alive.
 */
export function recordJobSkip(options: { readonly name: string; readonly reason: JobSkipReason }): void {
    jobInstruments().skips.add(1, {
        [ATTR_JOB_NAME]: options.name,
        [ATTR_JOB_SKIP_REASON]: options.reason
    });
}

interface JobInstruments {
    readonly duration: Histogram;
    readonly skips: Counter;
    readonly items: Counter;
}

/**
 * Instruments, built once per meter provider.
 *
 * Unlike the trace API, the metrics API has **no proxy provider**: `metrics.getMeter()` resolves
 * against whatever is registered *at call time*, and an instrument created before the SDK starts
 * is bound to the no-op provider forever. Creating them at module load would therefore silently
 * disable every job metric depending on import order. Keying the cache on the provider itself
 * fixes that in both directions — the no-op instruments are discarded the moment a real provider
 * registers — and keeps the hot path to one `WeakMap` lookup.
 */
const instrumentsByProvider = new WeakMap<MeterProvider, JobInstruments>();

function jobInstruments(): JobInstruments {
    const provider = metrics.getMeterProvider();
    const cached = instrumentsByProvider.get(provider);

    if (CommonUtils.notUndefined(cached)) {
        return cached;
    }

    const meter = getMeter(JOB_METER_NAME);
    const created: JobInstruments = {
        duration: meter.createHistogram(METRIC_JOB_RUN_DURATION, {
            description: 'Duration of one run of a scheduled job.',
            unit: 's',
            advice: { explicitBucketBoundaries: [...JOB_RUN_DURATION_BUCKETS] }
        }),
        skips: meter.createCounter(METRIC_JOB_RUN_SKIPS, {
            description: 'Scheduled job runs that did not execute.',
            unit: '{skip}'
        }),
        items: meter.createCounter(METRIC_JOB_RUN_ITEMS, {
            description: 'Items handled inside scheduled job runs.',
            unit: '{item}'
        })
    };

    instrumentsByProvider.set(provider, created);

    return created;
}

function recordOnSettle<T>(name: string, startedAt: number, span: Span, fn: (run: JobRunContext) => T): T {
    const run: JobRunContext = {
        span,
        recordItem: (outcome, count = 1) =>
            jobInstruments().items.add(count, { [ATTR_JOB_NAME]: name, [ATTR_JOB_ITEM_OUTCOME]: outcome })
    };

    let result: T;

    try {
        result = fn(run);
    } catch (error) {
        recordRun(name, startedAt, JOB_OUTCOME_VALUE_FAILURE);
        throw error;
    }

    if (!isPromiseLike(result)) {
        recordRun(name, startedAt, JOB_OUTCOME_VALUE_SUCCESS);
        return result;
    }

    return result.then(
        (value) => {
            recordRun(name, startedAt, JOB_OUTCOME_VALUE_SUCCESS);
            return value;
        },
        (error: unknown) => {
            recordRun(name, startedAt, JOB_OUTCOME_VALUE_FAILURE);
            throw error;
        }
    ) as T;
}

function recordRun(name: string, startedAt: number, outcome: JobOutcome): void {
    jobInstruments().duration.record((performance.now() - startedAt) / 1_000, {
        [ATTR_JOB_NAME]: name,
        [ATTR_JOB_RUN_OUTCOME]: outcome
    });
}
