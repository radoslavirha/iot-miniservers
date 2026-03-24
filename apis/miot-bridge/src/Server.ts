import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import '@tsed/mongoose';
import * as rest from './controllers/index.js';
import { ObjectUtils } from '@radoslavirha/utils';
import { CommandResponseFilter } from './filters/CommandResponseFilter.js';
import './providers/index.js';
import './services/UdpListenerService.js';
import './services/MqttListenerService.js';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        '/': [SwaggerController, ...ObjectUtils.values(rest)]
    },
    responseFilters: [
        CommandResponseFilter
    ]
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
