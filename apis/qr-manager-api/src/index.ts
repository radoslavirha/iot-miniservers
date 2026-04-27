import { Platform, ServerConfiguration } from '@radoslavirha/tsed-platform';
import { SwaggerConfig, SwaggerDocumentConfig, SwaggerProvider } from '@radoslavirha/tsed-swagger';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { Server } from './Server.js';
import { injector } from '@tsed/di';
import { ConfigService } from './services/ConfigService.js';
import { SwaggerDocs } from './models/SwaggerDocs.enum.js';
import { Logger } from '@radoslavirha/tsed-logger';

const SIG_EVENTS = [
    'beforeExit',
    'SIGHUP',
    'SIGINT',
    'SIGQUIT',
    'SIGILL',
    'SIGTRAP',
    'SIGABRT',
    'SIGBUS',
    'SIGFPE',
    'SIGUSR1',
    'SIGSEGV',
    'SIGUSR2',
    'SIGTERM'
];

const logger = injector().get<Logger>(Logger);

try {
    const config = injector().get<ConfigService>(ConfigService);

    const swaggerConfig = CommonUtils.buildModelStrict(SwaggerConfig, {
        title: config.api.service,
        version: config.api.version,
        description: config.api.description!,
        documents: ObjectUtils.values(SwaggerDocs).map((doc) =>
            CommonUtils.buildModelStrict(SwaggerDocumentConfig, {
                docs: doc,
                security: []
            })
        ),
        swaggerUIOptions: {
            validatorUrl: null
        },
        serverUrl: config.api.publicURL
    });

    const configuration: ServerConfiguration = {
        ...config.server,
        api: config.api,
        swagger: new SwaggerProvider(swaggerConfig).config,
        mongoose: ObjectUtils.isEnabled(config.config.mongodb) ? [
            {
                id: 'default',
                url: config.config.mongodb.url,
                connectionOptions: config.config.mongodb.connectionOptions
            }
        ] : undefined
    };

    const platform = await Platform.bootstrap(Server, configuration);
    await platform.listen();

    SIG_EVENTS.forEach((evt) =>
        process.on(evt, () => {
            platform.stop();
        })
    );

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
