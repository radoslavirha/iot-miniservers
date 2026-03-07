import { DeviceCommandOperation } from './DeviceCommandOperation.enum.js';

/**
 * Transport-agnostic internal command request.
 * Created by per-transport handlers (HTTP, UDP) and consumed by {@link DeviceCommandService}.
 */
export class DeviceCommandRequest {
    /** Numeric device ID as returned from registration. */
    public deviceId: number;
    /** Miot spec command key (e.g. vacuum:start-sweep). */
    public command: string;
    /** Operation type: GET_PROPERTY, SET_PROPERTY, or ACTION. */
    public operation: DeviceCommandOperation;
    /** Value for SET_PROPERTY operations or arguments for ACTION operations (e.g. room IDs for clean:rooms). */
    public value?: unknown;
}
