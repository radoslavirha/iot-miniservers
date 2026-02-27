import type { RemoteInfo } from 'dgram';
import type { APIVersion } from '../models/APIVersion.enum.js';
import type { UdpCommandRequestModel } from '../models/UdpCommandRequestModel.js';

export interface IUdpVersionHandler {
    /** API version this handler is responsible for. */
    readonly version: APIVersion;
    handle(request: UdpCommandRequestModel, rinfo: RemoteInfo): Promise<string>;
}
