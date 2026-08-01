import { Logger } from '@radoslavirha/tsed-logger';
import { Injectable, ProviderScope } from '@tsed/di';
import { ConfigService } from '../services/ConfigService.js';

@Injectable({ token: Logger, scope: ProviderScope.SINGLETON })
export class LoggerProvider extends Logger {

    constructor(configService: ConfigService) {
        super(configService.config.logger);
    }
}
