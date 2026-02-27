import { AdditionalProperties, Description, Enum, Example, Optional, Property, Required } from '@tsed/schema';
import { APIVersion } from './APIVersion.enum.js';
import { DeviceCommandOperation } from './DeviceCommandOperation.enum.js';

/**
 * UDP wire envelope. Contains a version field used for routing since UDP has no URL path.
 * Global layer validates this envelope; versioned handlers map it to their own request models.
 */
@Description('Command request model for the UDP transport.')
@AdditionalProperties(false)
export class UdpCommandRequestModel {
    @Description('API version used for routing (UDP has no URL path).')
    @Required()
    @Enum(APIVersion)
    public version: APIVersion;

    @Description('Numeric device ID returned from registration.')
    @Required()
    @Property(Number)
    @Example(1141132187)
    public deviceId: number;

    @Description('Miot spec command key (e.g. vacuum:start-sweep).')
    @Required()
    @Property(String)
    @Example('vacuum:start-sweep')
    public command: string;

    @Description(`Operation type: GET_PROPERTY, SET_PROPERTY, or ACTION.`)
    @Required()
    @Enum(DeviceCommandOperation)
    public operation: DeviceCommandOperation;

    @Description('Value for SET_PROPERTY operations or arguments for ACTION operations.')
    @Optional()
    @Property(Number)
    public value?: number;
}
