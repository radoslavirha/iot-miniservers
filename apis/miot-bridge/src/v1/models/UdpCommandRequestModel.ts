import { Description, Enum, Required } from '@tsed/schema';
import { CommandRequestModel } from './CommandRequestModel.js';
import { APIVersion } from '../../global/models/APIVersion.enum.js';

@Description('Command request model for the UDP transport. Extends the base model with a version field used for routing, since UDP has no URL path.')
export class UdpCommandRequestModel extends CommandRequestModel {
    @Description('API version used for routing (UDP has no URL path).')
    @Required()
    @Enum(APIVersion)
    public version: APIVersion;
}
