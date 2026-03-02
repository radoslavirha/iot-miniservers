import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration, Inject } from '@tsed/di';
import { DevicePropertyPollerService } from './global/services/DevicePropertyPollerService.js';
import * as restV1 from './v1/controllers/index.js';
import { APIVersion } from './global/models/APIVersion.enum.js';
import { ObjectUtils } from '@radoslavirha/utils';
// Ensure UdpCommandHandler (registered as UDPHandlerToken) is discovered by the DI container.
import './v1/services/UdpCommandHandler.js';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        '/': [SwaggerController],
        [`/${APIVersion.V1}`]: [...ObjectUtils.values(restV1)]
    }
})
export class Server extends BaseServer {
    @Inject(DevicePropertyPollerService)
    private readonly poller: DevicePropertyPollerService;

    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }

    async $onReady(): Promise<void> {
        await this.poller.start();
    }
}
