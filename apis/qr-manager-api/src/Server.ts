import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import '@tsed/mongoose';
import './providers/index.js';
import * as rest from './controllers/index.js';
import { ObjectUtils } from '@radoslavirha/utils';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        '/': [SwaggerController, ...ObjectUtils.values(rest)]
    }
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
