import { DeviceCommandOperation } from './DeviceCommandOperation.enum.js';

/**
 * Transport-agnostic internal raw command request.
 * Bypasses spec lookup — callers supply siid/piid/aiid directly.
 * Created by per-transport handlers and consumed by {@link DeviceCommandService.executeRaw}.
 */
export class RawCommandRequest {
    /** Numeric device ID as returned from registration. */
    public deviceId: number;
    /** Operation type: GET_PROPERTY, SET_PROPERTY, or ACTION. */
    public operation: DeviceCommandOperation;
    /** Service instance ID from the MIoT spec. */
    public siid: number;
    /** Property instance ID — required for GET_PROPERTY and SET_PROPERTY operations. */
    public piid?: number;
    /** Action instance ID — required for ACTION operations. */
    public aiid?: number;
    /** Value for SET_PROPERTY operations or arguments for ACTION operations. */
    public value?: string | number | string[] | number[];
}
