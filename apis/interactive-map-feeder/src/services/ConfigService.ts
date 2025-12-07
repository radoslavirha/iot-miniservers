import { ConfigProvider, ConfigProviderOptions } from '@radoslavirha/tsed-configuration';
import { Injectable } from '@tsed/di';
import { ConfigModel } from '../models/ConfigModel.js';

@Injectable()
export class ConfigService extends ConfigProvider<ConfigModel> {
    public static readonly options: ConfigProviderOptions<ConfigModel> = {
        configModel: ConfigModel,
        debug: true
    };

    constructor() {
        super(ConfigService.options);
    }
}
