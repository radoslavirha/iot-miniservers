import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import * as restV1 from './v1/controllers/index.js';
import { APIVersion } from './global/models/APIVersion.enum.js';
import { ObjectUtils } from '@radoslavirha/utils';
// Ensure UdpCommandHandler (registered as UDPHandlerToken) is discovered by the DI container.
import './global/services/UdpListenerService.js';
import './v1/services/UdpCommandHandler.js';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        '/': [SwaggerController],
        [`/${APIVersion.V1}`]: [...ObjectUtils.values(restV1)]
    }
})
export class Server extends BaseServer {

    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }

    async $onReady(): Promise<void> {
    }
}
