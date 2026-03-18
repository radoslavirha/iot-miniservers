import { MiotTransport } from './MiotTransport.js';
import type { DiscoverResult, GetPropertiesResult, MiotDeviceOptions, StampState } from './types.js';

/**
 * Stateful MIoT device client.
 *
 * Each instance represents a single physical device. The instance owns the
 * stamp lifecycle: it caches the last-used stamp in memory and reactively
 * re-handshakes on command failure.
 *
 * ### Typical single-node usage
 * ```ts
 * const device = new MiotDevice({ address: '192.168.1.42', token: 'aabbcc...' });
 * const { deviceId } = await device.connect();
 * const fan = await device.getProperty(2, 11);
 * ```
 *
 * ### Multi-node usage (stamp backed by Redis / DB)
 * Supply an {@link IStampStore} implementation via `options.stampStore`.
 * The store is consulted before each command and updated after every stamp
 * refresh, keeping all nodes in sync.
 */
export class MiotDevice {
    private readonly transport: MiotTransport;
    private readonly options: MiotDeviceOptions;
    private _deviceId: number | undefined;
    private _stampState: StampState | undefined;

    constructor(options: MiotDeviceOptions) {
        this.options = options;
        this._deviceId = options.deviceId;
        this.transport = new MiotTransport(options.address, options.token, options.port);
    }

    /**
     * Sends a hello packet to the device and returns its current identity.
     * Also seeds the internal stamp state so subsequent commands avoid a
     * redundant handshake.
     *
     * Intended for **device discovery** (registering a new device) and
     * **connectivity checks**. After calling `discover()` the instance is
     * ready to send commands — no separate `connect()` call is needed.
     */
    async discover(): Promise<DiscoverResult> {
        const result = await this.transport.handshake();
        this._deviceId = result.deviceId;
        this._stampState = { stamp: result.stamp, updatedAt: Date.now() };
        await this.persistStamp(this._stampState);
        return result;
    }

    /**
     * Establishes the connection to the device: performs a handshake and
     * seeds the internal stamp state. Must be called before using any
     * command methods when `deviceId` was not set in the constructor.
     *
     * Throws if the device is unreachable.
     */
    async connect(): Promise<void> {
        await this.discover();
    }

    async getProperty(siid: number, piid: number): Promise<string | number | undefined> {
        return this.runWithStamp(async (stamp, deviceId) => {
            const value = await this.transport.getProperty(deviceId, stamp, siid, piid);
            return { result: value };
        });
    }

    async setProperty(siid: number, piid: number, value: string | number): Promise<void> {
        await this.runWithStamp(async (stamp, deviceId) => {
            await this.transport.setProperty(deviceId, stamp, siid, piid, value);
            return { result: undefined };
        });
    }

    async callAction(siid: number, aiid: number, args?: unknown): Promise<void> {
        await this.runWithStamp(async (stamp, deviceId) => {
            await this.transport.callAction(deviceId, stamp, siid, aiid, args);
            return { result: undefined };
        });
    }

    /**
     * Bulk-reads multiple properties in chunked UDP calls.
     *
     * @param props        - Properties to read, identified by siid + piid.
     * @param maxChunkSize - Max properties per UDP call (default 14).
     */
    async getProperties(
        props: Array<{ siid: number; piid: number }>,
        maxChunkSize = 14
    ): Promise<GetPropertiesResult[]> {
        return this.runWithStamp(async (stamp, deviceId) => {
            const { results, finalStamp } = await this.transport.getProperties(deviceId, stamp, props, maxChunkSize);
            return { result: results, finalStamp };
        });
    }

    /**
     * Returns the current stamp state.
     * Useful for manually persisting the stamp on shutdown or seeding another instance.
     * Returns `undefined` if `connect()` / `discover()` has not been called yet.
     */
    getStampState(): StampState | undefined {
        return this._stampState;
    }

    /**
     * Seeds the internal stamp state without performing a handshake.
     * Useful for restoring state from a DB / Redis on startup.
     */
    setStampState(state: StampState): void {
        this._stampState = state;
    }

    /** The hardware device ID, set after the first `connect()` or `discover()` call. */
    get deviceId(): number | undefined {
        return this._deviceId;
    }

    /**
     * Runs `fn` with automatic stamp-refresh retry.
     *
     * If no stamp state exists, a fresh handshake is performed first.
     * Otherwise the cached stamp is tried; on failure the stamp state is
     * cleared, a handshake is performed, and the call is retried once.
     *
     * `fn` must return `{ result, finalStamp? }`. When `finalStamp` is
     * provided (multi-chunk operations), it is used as the persisted stamp
     * instead of the stamp passed to `fn`.
     */
    private async runWithStamp<T>(
        fn: (stamp: number, deviceId: number) => Promise<{ result: T; finalStamp?: number }>
    ): Promise<T> {
        const deviceId = this.requireDeviceId();

        // Load stamp from external store if available (multi-node support)
        if (this.options.stampStore && !this._stampState) {
            const stored = await this.options.stampStore.getStamp();
            if (stored) {
                this._stampState = stored;
            }
        }

        if (!this._stampState) {
            return this.runWithFreshStamp(deviceId, fn);
        }

        try {
            const stamp = this._stampState.stamp + 1;
            const { result, finalStamp } = await fn(stamp, deviceId);
            await this.updateStamp(finalStamp ?? stamp);
            return result;
        } catch (_err) {
            // Command failed — clear stamp state and retry with fresh handshake
            this._stampState = undefined;
            const reason = _err instanceof Error ? _err.message : String(_err);
            console.warn(`[MiotDevice] Command failed (device ${deviceId}), retrying with fresh stamp: ${reason}`);
        }

        return this.runWithFreshStamp(deviceId, fn);
    }

    private async runWithFreshStamp<T>(
        deviceId: number,
        fn: (stamp: number, deviceId: number) => Promise<{ result: T; finalStamp?: number }>
    ): Promise<T> {
        const { stamp: freshStamp } = await this.transport.handshake();
        const stamp = freshStamp + 1;
        try {
            const { result, finalStamp } = await fn(stamp, deviceId);
            await this.updateStamp(finalStamp ?? stamp);
            return result;
        } catch (retryError) {
            const reason = retryError instanceof Error ? retryError.message : String(retryError);
            throw new Error(`Operation failed after stamp refresh for device ${deviceId}: ${reason}`);
        }
    }

    private async updateStamp(stamp: number): Promise<void> {
        this._stampState = { stamp, updatedAt: Date.now() };
        await this.persistStamp(this._stampState);
    }

    private async persistStamp(state: StampState): Promise<void> {
        if (this.options.stampStore) {
            await this.options.stampStore.setStamp(state);
        }
    }

    private requireDeviceId(): number {
        if (this._deviceId === undefined) {
            throw new Error('Device not connected. Call connect() or discover() first.');
        }
        return this._deviceId;
    }
}
