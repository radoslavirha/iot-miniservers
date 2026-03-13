import { AdditionalProperties, AnyOf, Description, Enum, Example, Optional, Property, Required } from '@tsed/schema';
import { DeviceCommandOperation } from '../models/DeviceCommandOperation.enum.js';

@Description('Command request model shared by HTTP and MQTT transports.')
@AdditionalProperties(false)
export class CommandRequestModel {
    @Description('Numeric device ID returned from registration.')
    @Required()
    @Property(Number)
    public deviceId: number;

    @Description('Miot spec command key (e.g. vacuum:start-sweep).')
    @Required()
    @Property(String)
    @Example('vacuum:start-sweep')
    public command: string;

    @Description(`Operation type: ${DeviceCommandOperation.GetProperty}, ${DeviceCommandOperation.SetProperty}, or ${DeviceCommandOperation.Action}.`)
    @Required()
    @Enum(DeviceCommandOperation)
    public operation: DeviceCommandOperation;

    @Description(`Value for ${DeviceCommandOperation.SetProperty} operations or arguments for ${DeviceCommandOperation.Action} operations (e.g. [1, 2, 3]).`)
    @Optional()
    @AnyOf()
    public value?: string | number | string[] | number[];
}
