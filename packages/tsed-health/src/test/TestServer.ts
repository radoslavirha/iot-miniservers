import { Configuration } from '@tsed/di';
import '@tsed/platform-express';
import { HealthController } from '../HealthController.js';
import './TestHealthProvider.js';

/**
 * Minimal Ts.ED server for HealthController integration tests.
 *
 * Deliberately does not extend `BaseServer` from `@radoslavirha/tsed-platform`: this
 * package sits below it, and depending on it here would invert the dependency. The
 * `@tsed/platform-express` import is what supplies the platform adapter — without it
 * `PlatformTest.callback()` produces a handler that never responds.
 */
@Configuration({
    mount: {
        '/': [HealthController]
    },
    logger: {
        level: 'off'
    }
})
export class TestServer {}
