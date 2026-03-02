/**
 * Emitted by DevicePropertyPollerService when a subscribed property value changes
 * (or, when dispatchOnChange is false, on every polling cycle).
 *
 * Consumers (Phase 5.3 NotificationDispatchService) listen for PROPERTY_CHANGED events
 * and forward this payload to configured transports (UDP / HTTP / MQTT).
 */
export interface PropertyChangeEvent {
    /** Application-level device ID (UUID v4). */
    deviceId: string;
    /** Miot spec composite property key (e.g. `vacuum:mode`). */
    property: string;
    /** Value last seen before this update. `undefined` on the first observation. */
    oldValue: unknown;
    /** Current value returned by the device. */
    newValue: unknown;
    /** Unix timestamp (ms) of when the change was detected. */
    timestamp: number;
}
