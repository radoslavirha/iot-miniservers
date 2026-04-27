import { Logger } from '@radoslavirha/tsed-logger';
import { OverrideProvider, ProviderScope, Scope } from '@tsed/di';
import { ConfigService } from '../services/ConfigService.js';

@OverrideProvider(Logger)
@Scope(ProviderScope.SINGLETON)
export class LoggerProvider extends Logger {

    constructor(configService: ConfigService) {
        super(configService.config.logger);
    }
}
