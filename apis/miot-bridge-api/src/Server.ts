import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { HealthController } from '@radoslavirha/tsed-health';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import '@tsed/mongoose';
import * as rest from './controllers/index.js';
import { ObjectUtils } from '@radoslavirha/utils';
import { CommandResponseFilter } from './filters/CommandResponseFilter.js';
import './providers/index.js';
// Imported for its side effect: the @Injectable({ type: HEALTH_CHECKS }) decorators run
// on module load, which is what makes the checks visible to injectMany.
import './health/index.js';
import './services/UdpListenerService.js';
import './services/MqttListenerService.js';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        // HealthController stays at '/' so the probe path is identical across every app —
        // the chart's probe block is copy-paste only while that holds.
        '/': [SwaggerController, HealthController, ...ObjectUtils.values(rest)]
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
