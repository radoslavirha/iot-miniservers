import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { HealthController } from '@radoslavirha/tsed-health';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import '@tsed/mongoose';
import './providers/index.js';
// Imported for its side effect: the @Injectable({ type: HEALTH_CHECKS }) decorators run
// on module load, which is what makes the checks visible to injectMany.
import './health/index.js';
import * as rest from './controllers/index.js';
import { ObjectUtils } from '@radoslavirha/utils';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        // HealthController stays at '/' so the probe path is identical across every app —
        // the chart's probe block is copy-paste only while that holds.
        //
        // Mount order is NOT load-bearing. It used to be: RedirectController was
        // @Controller('/') with @Get('/:slug'), which matched any single-segment path
        // including `/health`, so a reorder left every probe green while the human-facing
        // `/health` degraded into a slug lookup. It now mounts at `/r` and cannot shadow
        // anything. Server.integration.spec.ts pins the invariant rather
        // than the ordering, so re-introducing a root catch-all fails there.
        '/': [SwaggerController, HealthController, ...ObjectUtils.values(rest)]
    }
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
