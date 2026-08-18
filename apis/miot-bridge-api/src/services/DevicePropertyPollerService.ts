import { EventEmitter } from 'events';
import { Service, Scope, ProviderScope, OnDestroy, OnInit } from '@tsed/di';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { ConfigService } from './ConfigService.js';
import { NotificationStorageService } from './NotificationStorageService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { NotificationDispatchService } from './NotificationDispatchService.js';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';
import {
    recordJobSkip,
    recordSpanError,
    runJob,
    withSpan,
    JOB_OUTCOME_VALUE_FAILURE,
    JOB_OUTCOME_VALUE_SUCCESS,
    JOB_SKIP_REASON_VALUE_NOTHING_DUE,
    type JobOutcome
} from '@radoslavirha/otel';
import type { Span } from '@opentelemetry/api';
import {
    ATTR_MIOT_DEVICE_ID,
    ATTR_MIOT_DEVICE_STORAGE_ID,
    ATTR_MIOT_POLL_DEVICE_COUNT,
    ATTR_MIOT_POLL_FAILING_COUNT,
    ATTR_MIOT_POLL_INTERVAL_MS,
    ATTR_MIOT_POLL_SUBSCRIPTION_COUNT,
    ATTR_MIOT_PROPERTY_COUNT,
    JOB_POLL_DEVICE_PROPERTIES,
    JOB_POLL_SUBSCRIPTIONS_LOAD,
    POLLER_TRACER_NAME,
    SPAN_POLL_DEVICE,
    SPAN_POLL_SUBSCRIPTIONS_LOAD,
    SPAN_POLL_TICK
} from '../otel/telemetry.js';

/**
 * Event name emitted on every detected property change (or every cycle when dispatchOnChange = false).
 * Consumers attach via `poller.on(PROPERTY_CHANGED, (event: PropertyChangeEvent) => ...)`.
 */
export const PROPERTY_CHANGED = 'property:changed' as const;

/**
 * Default minimum gap between two traced ticks when `polling.traceIntervalMs` is unset.
 *
 * One minute against the production 5s interval traces one tick in twelve. See
 * {@link DevicePropertyPollerService.shouldTrace} for why the poller is sampled at all.
 */
export const DEFAULT_POLL_TRACE_INTERVAL_MS = 60_000;

/** One device's share of a tick: its id and the properties subscribed for it. */
interface PollTarget {
    readonly deviceId: string;
    readonly properties: string[];
}

/**
 * Polls all subscribed device properties on a configurable interval.
 * Detects value changes and emits {@link PROPERTY_CHANGED} events for the
 * Phase 5.3 notification dispatch pipeline to consume.
 *
 * Subscriptions are kept in an in-memory cache (`_subscriptions`) so no DB
 * read is performed during each tick. The cache is hydrated once on `start()`
 * and kept in sync via `addSubscriptions`, `removeSubscription`, and
 * `removeAllSubscriptions` — called by the notification REST handlers.
 *
 * Per-device back-off: after `maxErrorCount` consecutive failures the device
 * is skipped for `errorSkipCycles` cycles before being retried.
 *
 * ### Telemetry
 * A tick is a **job**: `runJob` gives it a root span *and* the `job.*` metrics in one call.
 * Everything the poll touches underneath (the device record lookup, the override lookup, the UDP
 * read) is traced by instrumentations that know nothing about the poller and attach to whatever
 * span is current; with no span there they each became a parentless single-span trace, and every
 * log line the poller wrote had no `trace_id`.
 *
 * Metrics are the primary signal and traces are head-sampled, so **`job.run.duration` is recorded
 * for every tick including the ones that emit no span**. Note that the tick itself practically
 * never fails — a device fault is caught per device and turned into back-off — so `job.run.items`
 * split by `job.item.outcome` is the metric that says whether the poller is actually working. Run
 * outcome alone would report a perfectly healthy job with every device dead.
 *
 * ### Scheduling shape
 * `scheduleNext` re-arms a `setTimeout` in {@link tick}'s `finally`, i.e. *after* the awaited work,
 * so exactly one timer is ever armed. Two consequences:
 *
 * - The poller **cannot overrun**. `_ticking` is defensive and unreachable, which is why no
 *   `job.skip.reason=overrun` is recorded here; a fixed-rate `setInterval` job would need it.
 * - The effective period is `intervalMs + tick duration`, so a slow tick makes the job run *late*
 *   rather than skipping. That drift is already observable — see `job.run.duration` above and the
 *   run-rate query in `.apm/skills/instrument-entry-point/SKILL.md` — so it gets no metric of its
 *   own.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class DevicePropertyPollerService extends EventEmitter implements OnInit, OnDestroy {
    private _timer: NodeJS.Timeout | undefined;
    private _ticking = false;

    /** In-memory subscription cache: deviceId → Set<propertyKey>. */
    private readonly _subscriptions = new Map<string, Set<string>>();

    /** Last known value per device+property key `${deviceId}:${property}`. */
    private readonly _lastValues = new Map<string, unknown>();

    /** Consecutive error count per deviceId. Reset on success. */
    private readonly _errorCounts = new Map<string, number>();

    /** Remaining skip-cycles per deviceId before the device is retried. */
    private readonly _skipCycles = new Map<string, number>();

    /** Timestamp of the last traced tick. 0 so the first tick after startup is always traced. */
    private _lastTracedAt = 0;

    private readonly logger: BaseLogger;

    constructor(
        private readonly configService: ConfigService,
        private readonly notificationStorageService: NotificationStorageService,
        private readonly deviceCommandService: DeviceCommandService,
        private readonly notificationDispatch: NotificationDispatchService,
        logger: Logger
    ) {
        super();
        this.logger = logger.child('DEVICE_POLL');
    }

    /**
     * Registers one or more property subscriptions for a device.
     * Called by `NotificationPostHandler` after persisting to storage.
     */
    public addSubscriptions(deviceId: string, properties: string[]): void {
        const set = this._subscriptions.get(deviceId) ?? new Set<string>();
        for (const p of properties) set.add(p);
        this._subscriptions.set(deviceId, set);
    }

    /**
     * Removes a single property subscription for a device.
     * Called by `NotificationDeleteHandler` after deleting from storage.
     * Also clears the last-known value so a fresh read is treated as first observation.
     */
    public removeSubscription(deviceId: string, property: string): void {
        const set = this._subscriptions.get(deviceId);
        if (CommonUtils.notNil(set)) {
            set.delete(property);
            if (set.size === 0) {
                this._subscriptions.delete(deviceId);
            }
        }
        this._lastValues.delete(`${deviceId}:${property}`);
    }

    /**
     * Removes all property subscriptions for a device.
     * Called by `NotificationDeleteAllHandler` after deleting from storage.
     */
    public removeAllSubscriptions(deviceId: string): void {
        this._subscriptions.delete(deviceId);
        for (const key of this._lastValues.keys()) {
            if (key.startsWith(`${deviceId}:`)) this._lastValues.delete(key);
        }
    }

    /**
     * Hydrates the in-memory subscription cache from storage, then starts the
     * polling interval. Called from `Server.$onReady()`.
     */
    private async start(): Promise<void> {
        const config = this.configService.config.polling;
        if (!ObjectUtils.isEnabled(config)) {
            this.logger.info('Device property polling is disabled.');
            return;
        }

        // A one-shot startup task is a job too, and worth the same instruments: a subscription
        // load that is slow or throwing is the reason a poller that looks alive polls nothing.
        // It records no items — its "items" are an inventory snapshot, not throughput, and
        // summing an inventory into a rate counter would make `job.run.items` mean two things.
        await runJob(
            { name: JOB_POLL_SUBSCRIPTIONS_LOAD, tracer: POLLER_TRACER_NAME, spanName: SPAN_POLL_SUBSCRIPTIONS_LOAD },
            ({ span }) => this.loadSubscriptions(span)
        );

        this.logger.info(`Device property polling started. Interval: ${config.intervalMs}ms.`);

        // Scheduled after the startup span has closed, so the timer does not inherit its
        // context. Tick spans are roots regardless, but a timer that captures a finished span
        // is a trap worth not laying.
        this.scheduleNext(config.intervalMs);
    }

    /** Reads every stored subscription into the in-memory cache. One DB round trip. */
    private async loadSubscriptions(span: Span): Promise<void> {
        const all = await this.notificationStorageService.getAll();
        for (const n of all) {
            const set = this._subscriptions.get(n.deviceId) ?? new Set<string>();
            set.add(n.property);
            this._subscriptions.set(n.deviceId, set);
        }

        span.setAttributes({
            [ATTR_MIOT_POLL_SUBSCRIPTION_COUNT]: all.length,
            [ATTR_MIOT_POLL_DEVICE_COUNT]: this._subscriptions.size
        });
        this.logger.info(`Loaded ${all.length} subscription(s) across ${this._subscriptions.size} device(s).`);
    }

    /** Stops the polling interval. */
    private stop(): void {
        if (CommonUtils.notNil(this._timer)) {
            clearTimeout(this._timer);
            this._timer = undefined;
            this.logger.info('Device property polling stopped.');
        }
    }

    private scheduleNext(intervalMs: number): void {
        this._timer = setTimeout(() => void this.tick(intervalMs), intervalMs);
    }

    private async tick(intervalMs: number): Promise<void> {
        // Unreachable, and deliberately left uninstrumented: `scheduleNext` re-arms in the
        // `finally` below, after the work, so only one timer is ever armed and no second tick can
        // start while this one runs. Counting a `job.skip.reason=overrun` here would emit a series
        // that can only ever read zero. A fixed-rate job would be a different story.
        if (this._ticking) {
            return;
        }
        this._ticking = true;
        try {
            await this.pollDueDevices(intervalMs);
        } finally {
            this._ticking = false;
            if (CommonUtils.notNil(this._timer)) {
                this.scheduleNext(intervalMs);
            }
        }
    }

    /**
     * Polls every device due this tick as one job run.
     *
     * Per tick rather than per device: the timer firing is the unit of work, and a root per
     * device would multiply the trace list by the device count while telling you nothing the
     * child spans do not. A tick with nothing due opens no span at all — an idle poller should
     * be silent in Tempo, not emit an empty wrapper every interval — but it *does* count a
     * `nothing_due` skip, because that counter is the only thing separating "idle" from "dead"
     * once every device is in back-off and the duration histogram stops moving.
     */
    private async pollDueDevices(intervalMs: number): Promise<void> {
        const due = this.dueDevices();

        if (due.length === 0) {
            recordJobSkip({ name: JOB_POLL_DEVICE_PROPERTIES, reason: JOB_SKIP_REASON_VALUE_NOTHING_DUE });
            return;
        }

        await runJob(
            {
                name: JOB_POLL_DEVICE_PROPERTIES,
                tracer: POLLER_TRACER_NAME,
                spanName: SPAN_POLL_TICK,
                attributes: {
                    [ATTR_MIOT_POLL_DEVICE_COUNT]: due.length,
                    [ATTR_MIOT_POLL_FAILING_COUNT]: this.failingCount(due),
                    [ATTR_MIOT_POLL_INTERVAL_MS]: intervalMs
                },
                // Trace sampling only. The duration and the item outcomes below are recorded on
                // every tick regardless — that pairing is the point of `runJob`.
                suppressTrace: !this.shouldTrace(due, Date.now())
            },
            async ({ recordItem }) => {
                for (const target of due) {
                    recordItem(await this.pollDevice(target.deviceId, target.properties));
                }
            }
        );
    }

    /**
     * Devices to poll this tick, decrementing the back-off counter of the ones being skipped.
     *
     * Split out of {@link pollDevice} so the tick knows its own size before it opens a span:
     * both the "nothing due" shortcut and the sampling decision need the answer up front.
     */
    private dueDevices(): PollTarget[] {
        const due: PollTarget[] = [];

        for (const [deviceId, propertySet] of this._subscriptions) {
            const skipRemaining = this._skipCycles.get(deviceId) ?? 0;

            if (skipRemaining > 0) {
                this._skipCycles.set(deviceId, skipRemaining - 1);
                this.logger.debug(`Skipping device ${deviceId} (${skipRemaining} cycles remaining).`);
                continue;
            }

            due.push({ deviceId, properties: [...propertySet] });
        }

        return due;
    }

    /**
     * Whether this tick gets a trace.
     *
     * The poller is the loudest thing in this service and the least interesting: at the
     * production 5s interval an always-on tick span is ~17k traces a day, all identical, which
     * is what made a 6h Tempo search return nothing else. So ticks are head-sampled here, at
     * the one place that knows which of them matter:
     *
     * - **A tick with a failing device is always traced.** That is the case worth having spans
     *   for — a device timing out, a stamp refresh looping — and it is rare by construction,
     *   since `errorSkipCycles` puts a dead device to sleep for most cycles.
     * - **Otherwise at most one tick per `traceIntervalMs`**, enough to keep a latency baseline
     *   and prove the pipeline works.
     *
     * A sampled-out tick is *suppressed*, not merely unwrapped: without a span and without
     * suppression its Mongo and UDP calls would each start a trace of their own again. The cost
     * is that a property change detected in a suppressed tick publishes its notification
     * untraced — set `traceIntervalMs: 0` to trace every tick while debugging one.
     */
    private shouldTrace(due: PollTarget[], now: number): boolean {
        const interval = this.configService.config.polling?.traceIntervalMs ?? DEFAULT_POLL_TRACE_INTERVAL_MS;
        const traced = this.failingCount(due) > 0 || interval <= 0 || now - this._lastTracedAt >= interval;

        if (traced) {
            this._lastTracedAt = now;
        }

        return traced;
    }

    /** Devices due this tick that already have at least one consecutive error recorded. */
    private failingCount(due: PollTarget[]): number {
        return due.filter((target) => (this._errorCounts.get(target.deviceId) ?? 0) > 0).length;
    }

    /** Polls one device, reporting the outcome so the tick can count it as a `job.run.items` item. */
    private async pollDevice(deviceId: string, properties: string[]): Promise<JobOutcome> {
        return withSpan(
            {
                name: SPAN_POLL_DEVICE,
                tracer: POLLER_TRACER_NAME,
                attributes: {
                    [ATTR_MIOT_DEVICE_STORAGE_ID]: deviceId,
                    [ATTR_MIOT_PROPERTY_COUNT]: properties.length
                }
            },
            (span) => this.readDevice(deviceId, properties, span)
        );
    }

    private async readDevice(deviceId: string, properties: string[], span: Span): Promise<JobOutcome> {
        try {
            const { miotDeviceId, results } = await this.deviceCommandService.getProperties(deviceId, properties);

            span.setAttribute(ATTR_MIOT_DEVICE_ID, miotDeviceId);

            if (!ObjectUtils.isEnabled(this.configService.config.polling)) {
                this.logger.info('Device property polling is disabled. Skipping tick.');
                // The read itself succeeded; polling was switched off mid-flight. Counting it as
                // a failed item would put a config change into the device-health metric.
                return JOB_OUTCOME_VALUE_SUCCESS;
            }
            const config = this.configService.config.polling;
            const now = Date.now();

            for (const { key, value: newValue, code } of results) {
                if (code !== 0) {
                    continue;
                }

                const cacheKey = `${deviceId}:${key}`;
                const oldValue = this._lastValues.get(cacheKey);
                const hasChanged = oldValue !== newValue;

                if (hasChanged || !config.dispatchOnChange) {
                    this._lastValues.set(cacheKey, newValue);
                    this.emit(PROPERTY_CHANGED, {
                        deviceId,
                        miotDeviceId,
                        property: key,
                        oldValue: hasChanged ? oldValue : newValue,
                        newValue,
                        timestamp: now
                    } satisfies PropertyChangeEvent);
                }
            }

            // Clear error counter on success; log recovery if previously failing
            if (this._errorCounts.has(deviceId)) {
                this.logger.info(`Device ${deviceId} recovered after consecutive errors.`);
                this._errorCounts.delete(deviceId);
            }

            return JOB_OUTCOME_VALUE_SUCCESS;
        } catch (error) {
            // Marked on the span rather than rethrown: the poller handles a device failure with
            // back-off, so `withSpan` never sees it and the span would otherwise look clean.
            recordSpanError(span, error);

            const message = error instanceof Error ? error.message : String(error);
            const maxErrors = this.configService.config.polling?.maxErrorCount ?? 3;
            const skipCycles = this.configService.config.polling?.errorSkipCycles ?? 20;
            const count = (this._errorCounts.get(deviceId) ?? 0) + 1;
            this._errorCounts.set(deviceId, count);

            if (count >= maxErrors) {
                this.logger.warn(`Device ${deviceId} failed ${maxErrors} times in a row (last: ${message}). Pausing for ${skipCycles} cycles.`, { deviceId });
                this._errorCounts.delete(deviceId);
                this._skipCycles.set(deviceId, skipCycles);
            } else {
                this.logger.warn(`Device ${deviceId} encountered an error (${count}/${maxErrors}): ${message}`, { deviceId });
            }

            // The fault is swallowed here by design, so the tick reports success and its span is
            // clean. This return value is the only thing that carries the failure into a metric.
            return JOB_OUTCOME_VALUE_FAILURE;
        }
    }

    public async $onInit(): Promise<void> {
        await this.start();
        this.on(PROPERTY_CHANGED, (event) => this.notificationDispatch.receive(event));
    }

    public async $onDestroy(): Promise<void> {
        await this.stop();
    }
}
