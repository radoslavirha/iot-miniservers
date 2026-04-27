import { AdditionalProperties, Any, Description, Required } from '@tsed/schema';
import { DeviceCommandOperation } from './index.js';

@Description(`Command response containing the property value (for ${DeviceCommandOperation.GetProperty} and ${DeviceCommandOperation.SetProperty} operations). Not present for ${DeviceCommandOperation.Action} operations.`)
@AdditionalProperties(false)
export class CommandValueResponse {
    @Required()
    @Any(String, Number)
    @Description(`The property value returned or set. Absent for ${DeviceCommandOperation.Action} operations.`)
    public value: string | number;
}
