import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { HealthController } from '@radoslavirha/tsed-health';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import './global/providers/index.js';
// Imported for its side effect: the @Injectable({ type: HEALTH_CHECKS }) decorator runs
// on module load, which is what makes the check visible to injectMany.
import './global/health/index.js';
import * as restV1 from './v1/controllers/index.js';
import { ObjectUtils } from '@radoslavirha/utils';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        // HealthController goes at '/', NOT '/v1' — the probe path must be identical
        // across every app or the chart's probe block stops being copy-paste.
        '/': [SwaggerController, HealthController],
        '/v1': [...ObjectUtils.values(restV1)]
    }
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
