import { AdditionalProperties, AnyOf, Description, Enum, Example, Optional, Property, Required } from '@tsed/schema';
import { DeviceCommandOperation } from './DeviceCommandOperation.enum.js';

@Description('Raw IID command request — bypasses spec lookup, invoking siid/piid/aiid directly with the device handshake.')
@AdditionalProperties(false)
export class RawCommandRequestModel {
    @Description('Numeric device ID returned from registration.')
    @Required()
    @Property(Number)
    public deviceId: number;

    @Description(`Operation type: ${DeviceCommandOperation.GetProperty}, ${DeviceCommandOperation.SetProperty}, or ${DeviceCommandOperation.Action}.`)
    @Required()
    @Enum(DeviceCommandOperation)
    public operation: DeviceCommandOperation;

    @Description('Service instance ID (siid) from the MIoT spec.')
    @Required()
    @Property(Number)
    @Example(2)
    public siid: number;

    @Description(`Property instance ID (piid) — required for ${DeviceCommandOperation.GetProperty} and ${DeviceCommandOperation.SetProperty} operations.`)
    @Optional()
    @Property(Number)
    @Example(1)
    public piid?: number;

    @Description(`Action instance ID (aiid) — required for ${DeviceCommandOperation.Action} operations.`)
    @Optional()
    @Property(Number)
    @Example(1)
    public aiid?: number;

    @Description(`Value for ${DeviceCommandOperation.SetProperty} operations or arguments for ${DeviceCommandOperation.Action} operations (e.g. [1, 2, 3]).`)
    @Optional()
    @AnyOf()
    public value?: string | number | string[] | number[];
}
