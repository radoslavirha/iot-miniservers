import { AdditionalProperties, Any, Description, Enum, Example, Optional, Property, Required } from '@tsed/schema';
import { DeviceCommandOperation } from './DeviceCommandOperation.enum.js';

@Description('Unified command response envelope for all transports.')
@AdditionalProperties(false)
export class CommandResponseModel {
    @Description('Numeric device ID the command was sent to.')
    @Required()
    @Property(Number)
    public deviceId: number;

    @Description('Miot spec command key that was executed.')
    @Required()
    @Property(String)
    @Example('vacuum:start-sweep')
    public command: string;

    @Description('Operation type that was performed.')
    @Required()
    @Enum(DeviceCommandOperation)
    public operation: DeviceCommandOperation;

    @Description('Whether the command was executed successfully.')
    @Required()
    @Property(Boolean)
    public success: boolean;

    @Description(`Property value returned by a ${DeviceCommandOperation.GetProperty} operation.`)
    @Optional()
    @Any()
    public value?: unknown;

    @Description('Error message when success is false.')
    @Optional()
    @Property(String)
    public error?: string;
}
