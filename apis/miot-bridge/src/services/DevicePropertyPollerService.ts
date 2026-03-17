import { EventEmitter } from 'events';
import { Service, Scope, ProviderScope, OnDestroy, OnInit } from '@tsed/di';
import { $log } from '@tsed/logger';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { ConfigService } from './ConfigService.js';
import { NotificationStorageService } from './NotificationStorageService.js';
import { DeviceCommandService } from './DeviceCommandService.js';
import { NotificationDispatchService } from './NotificationDispatchService.js';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';

/**
 * Event name emitted on every detected property change (or every cycle when dispatchOnChange = false).
 * Consumers attach via `poller.on(PROPERTY_CHANGED, (event: PropertyChangeEvent) => ...)`.
 */
export const PROPERTY_CHANGED = 'property:changed' as const;

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

    constructor(
        private readonly configService: ConfigService,
        private readonly notificationStorageService: NotificationStorageService,
        private readonly deviceCommandService: DeviceCommandService,
        private readonly notificationDispatch: NotificationDispatchService
    ) {
        super();
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
            $log.info({ event: 'POLLER_DISABLED', message: 'Device property polling is disabled.' });
            return;
        }

        const all = await this.notificationStorageService.getAll();
        for (const n of all) {
            const set = this._subscriptions.get(n.deviceId) ?? new Set<string>();
            set.add(n.property);
            this._subscriptions.set(n.deviceId, set);
        }
        $log.info({ event: 'POLLER_HYDRATED', message: `Loaded ${all.length} subscription(s) across ${this._subscriptions.size} device(s).` });

        $log.info({ event: 'POLLER_START', message: `Device property polling started. Interval: ${config.intervalMs}ms.` });
        this.scheduleNext(config.intervalMs);
    }

    /** Stops the polling interval. */
    private stop(): void {
        if (CommonUtils.notNil(this._timer)) {
            clearTimeout(this._timer);
            this._timer = undefined;
            $log.info({ event: 'POLLER_STOP', message: 'Device property polling stopped.' });
        }
    }

    private scheduleNext(intervalMs: number): void {
        this._timer = setTimeout(() => void this.tick(intervalMs), intervalMs);
    }

    private async tick(intervalMs: number): Promise<void> {
        if (this._ticking) {
            return;
        }
        this._ticking = true;
        try {
            for (const [deviceId, propertySet] of this._subscriptions) {
                await this.pollDevice(deviceId, [...propertySet]);
            }
        } finally {
            this._ticking = false;
            if (CommonUtils.notNil(this._timer)) {
                this.scheduleNext(intervalMs);
            }
        }
    }

    private async pollDevice(deviceId: string, properties: string[]): Promise<void> {
        // Back-off: device is in penalty — decrement and skip
        const skipRemaining = this._skipCycles.get(deviceId) ?? 0;
        if (skipRemaining > 0) {
            this._skipCycles.set(deviceId, skipRemaining - 1);
            $log.debug({ event: 'POLLER_SKIP', deviceId, message: `Skipping device ${deviceId} (${skipRemaining} cycles remaining).` });
            return;
        }

        try {
            const { miotDeviceId, results } = await this.deviceCommandService.getProperties(deviceId, properties);

            if (!ObjectUtils.isEnabled(this.configService.config.polling)) {
                $log.info({ event: 'POLLER_DISABLED', message: 'Device property polling is disabled. Skipping tick.' });
                return;
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
                $log.info({ event: 'POLLER_RECOVERED', deviceId, message: `Device ${deviceId} recovered after consecutive errors.` });
                this._errorCounts.delete(deviceId);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const maxErrors = this.configService.config.polling?.maxErrorCount ?? 3;
            const skipCycles = this.configService.config.polling?.errorSkipCycles ?? 20;
            const count = (this._errorCounts.get(deviceId) ?? 0) + 1;
            this._errorCounts.set(deviceId, count);

            if (count >= maxErrors) {
                $log.warn({
                    event: 'POLLER_BACKOFF',
                    deviceId,
                    message: `Device ${deviceId} failed ${maxErrors} times in a row (last: ${message}). Pausing for ${skipCycles} cycles.`
                });
                this._errorCounts.delete(deviceId);
                this._skipCycles.set(deviceId, skipCycles);
            } else {
                $log.warn({ event: 'POLLER_ERROR', deviceId, message: `(${count}/${maxErrors}) ${message}` });
            }
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
