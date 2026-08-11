import { Platform, ServerConfiguration } from '@radoslavirha/tsed-platform';
import { createShutdownHandler } from '@radoslavirha/tsed-health';
import { SwaggerConfig, SwaggerDocumentConfig, SwaggerProvider } from '@radoslavirha/tsed-swagger';
import { CommonUtils } from '@radoslavirha/utils';
import { Server } from './Server.js';
import { injector } from '@tsed/di';
import { ConfigService } from './global/services/ConfigService.js';
import { Logger } from '@radoslavirha/tsed-logger';

/**
 * Signals that should drain and shut down gracefully.
 *
 * `beforeExit` is deliberately absent: it fires when the event loop empties, not on a
 * signal, and would start a shutdown nobody asked for. The non-recoverable signals
 * (`SIGILL`, `SIGSEGV`, `SIGBUS`, `SIGFPE`, `SIGABRT`, `SIGTRAP`) are also absent —
 * the process is already broken, and a graceful drain cannot be trusted to complete.
 */
const SIG_EVENTS = ['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM'];

const logger = injector().get<Logger>(Logger);

try {
    const config = injector().get<ConfigService>(ConfigService);

    const swaggerConfig = CommonUtils.buildModelStrict(SwaggerConfig, {
        title: config.api.service,
        version: config.api.version,
        description: config.api.description!,
        documents: [
            CommonUtils.buildModelStrict(SwaggerDocumentConfig, {
                docs: 'v1',
                security: []
            })
        ],
        swaggerUIOptions: {
            validatorUrl: null
        },
        serverUrl: config.api.publicURL
    });
    const configuration: ServerConfiguration = {
        ...config.server,
        api: config.api,
        swagger: new SwaggerProvider(swaggerConfig).config
    };

    const platform = await Platform.bootstrap(Server, configuration);
    await platform.listen();

    // Flips /health/ready to 503, waits for in-flight requests, then stops. Ts.ED has no
    // pre-shutdown hook — `platform.stop()` destroys the injector before closing the
    // listeners — so the drain has to be driven from here, not from a lifecycle hook.
    const shutdown = createShutdownHandler(platform, {
        onShutdown: (phase) => logger.info(`Server ${phase}.`, { event: 'SERVER_SHUTDOWN' })
    });

    SIG_EVENTS.forEach((evt) => process.on(evt, shutdown));

    ['uncaughtException', 'unhandledRejection'].forEach((evt) =>
        process.on(evt, async (error) => {
            logger.error(error.message, {
                event: 'SERVER_' + evt.toUpperCase(),
                stack: error.stack
            });
            await platform.stop();
        })
    );
} catch (error) {
    logger.error('Bootstrap failed.', { error: error });
    process.exit(1);
}

