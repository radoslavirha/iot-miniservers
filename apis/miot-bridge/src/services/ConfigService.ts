import { ConfigProvider, ConfigProviderOptions } from '@radoslavirha/tsed-configuration';
import { Injectable } from '@tsed/di';
import { ConfigModel, ConfigSchema } from '../models/config/ConfigModel.js';

@Injectable()
export class ConfigService extends ConfigProvider<ConfigModel> {
    public static readonly options: ConfigProviderOptions<ConfigModel> = {
        schema: ConfigSchema
    };

    constructor() {
        super(ConfigService.options);
    }
}
