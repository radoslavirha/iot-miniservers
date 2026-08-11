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
        // ORDER MATTERS HERE. RedirectController is @Controller('/') with @Get('/:slug'),
        // which matches any single-segment path — including `/health`. Express resolves in
        // registration order, so HealthController must come first or `/health` degrades
        // into a slug lookup and 404s. `/health/live` and `/health/ready` are two segments
        // and unaffected, so the probes would keep passing while the human-facing endpoint
        // silently broke. Pinned by a test in Server.integration.spec.ts.
        '/': [SwaggerController, HealthController, ...ObjectUtils.values(rest)]
    }
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
