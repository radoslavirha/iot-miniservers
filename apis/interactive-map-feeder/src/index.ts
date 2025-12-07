import { $log } from '@tsed/logger';
import { Platform, ServerConfiguration } from '@radoslavirha/tsed-platform';
import { SwaggerConfig, SwaggerDocumentConfig, SwaggerProvider } from '@radoslavirha/tsed-swagger';
import { CommonUtils } from '@radoslavirha/utils';
import { Server } from './Server.js';
import { injector } from '@tsed/di';
import { ConfigService } from './services/ConfigService.js';

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

try {
    const config = injector().get<ConfigService>(ConfigService);

    const swaggerConfig = CommonUtils.buildModel(SwaggerConfig, {
        title: config.api.service,
        version: config.api.version,
        description: config.api.description,
        documents: [
            CommonUtils.buildModel(SwaggerDocumentConfig, {
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

    SIG_EVENTS.forEach((evt) => process.on(evt, () => platform.stop()));

    ['uncaughtException', 'unhandledRejection'].forEach((evt) =>
        process.on(evt, async (error) => {
            $log.error({ event: 'SERVER_' + evt.toUpperCase(), message: error.message, stack: error.stack });
            await platform.stop();
        })
    );
} catch (error) {
    $log.error({ event: 'SERVER_BOOTSTRAP_ERROR', message: (error as Error).message, stack: (error as Error).stack });
}

