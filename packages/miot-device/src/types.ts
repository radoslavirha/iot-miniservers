/**
 * OTEL-compliant logger interface.
 * Compatible with child loggers from `@radoslavirha/tsed-logger`.
 */
export interface ILogger {
    trace(message: string, ...args: unknown[]): void;
    debug(message: string, ...args: unknown[]): void;
    info(message: string, ...args: unknown[]): void;
    warn(message: string, ...args: unknown[]): void;
    error(message: string, ...args: unknown[]): void;
    fatal(message: string, ...args: unknown[]): void;
}

/** Stamp state stored per device instance. */
export interface StampState {
    /** Last stamp sent to the device. */
    stamp: number;
    /** Unix timestamp (ms) of when this stamp was obtained. */
    updatedAt: number;
}

/**
 * Optional external stamp store for multi-node deployments (e.g. Redis).
 * If provided, the stamp is read on first use and written after every
 * successful operation that updates the stamp.
 */
export interface IStampStore {
    getStamp(): Promise<StampState | null>;
    setStamp(state: StampState): Promise<void>;
}

export interface MiotDeviceOptions {
    /** IP address of the device. */
    address: string;
    /** 32-char hex device token. */
    token: string;
    /**
     * Xiaomi hardware device ID.
     * Optional — populated automatically after the first {@link MiotDevice.connect} or
     * {@link MiotDevice.discover} call. Required before command methods can be used.
     */
    deviceId?: number;
    /**
     * Optional external stamp store for multi-node deployments.
     * When provided, the store is consulted on every command and updated after
     * every successful stamp refresh.
     */
    stampStore?: IStampStore;
    /**
     * UDP port the device listens on.
     * @default 54321
     */
    port?: number;
    /**
     * Optional logger. Defaults to a no-op logger.
     */
    logger?: ILogger;
}

/** Result returned by {@link MiotDevice.discover}. */
export interface DiscoverResult {
    deviceId: number;
    stamp: number;
}

export interface GetPropertiesResult {
    siid: number;
    piid: number;
    value?: string | number;
    code: number;
}
