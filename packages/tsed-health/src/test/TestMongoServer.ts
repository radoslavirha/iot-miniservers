import { Configuration } from '@tsed/di';
import '@tsed/mongoose';
import '@tsed/platform-express';
import { HealthController } from '../HealthController.js';
import './TestHealthProvider.js';
import '../mongoose.js';

/**
 * Ts.ED server for the Mongo health check's integration spec.
 *
 * `TestContainersMongo.create(TestMongoServer)` supplies the `mongoose` connection
 * settings, so none are declared here — the point is to exercise a *real* connection and
 * watch `readyState` respond to it.
 *
 * The bare `../mongoose.js` import is what registers `MongoHealthCheck` under
 * `HEALTH_CHECKS`; the decorator runs on module load.
 */
@Configuration({
    mount: {
        '/': [HealthController]
    },
    logger: {
        level: 'off'
    }
})
export class TestMongoServer {}
