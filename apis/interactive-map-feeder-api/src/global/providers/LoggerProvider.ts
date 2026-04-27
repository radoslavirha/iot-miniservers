import { Logger } from '@radoslavirha/tsed-logger';
import { Injectable, OverrideProvider, ProviderScope, Scope } from '@tsed/di';
import { ConfigService } from '../services/ConfigService.js';

@Injectable()
@OverrideProvider(Logger)
@Scope(ProviderScope.SINGLETON)
export class LoggerProvider extends Logger {
    constructor(configService: ConfigService) {
        super(configService.config.logger);
    }
}