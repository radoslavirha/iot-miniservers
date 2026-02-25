import { SwaggerController } from '@radoslavirha/tsed-swagger';
import { getServerDefaultConfig } from '@radoslavirha/tsed-configuration';
import { BaseServer } from '@radoslavirha/tsed-platform';
import { Configuration } from '@tsed/di';
import * as restV1 from './v1/controllers/index.js';

@Configuration({
    ...getServerDefaultConfig(),
    mount: {
        '/': [SwaggerController],
        '/v1': [...Object.values(restV1)]
    }
})
export class Server extends BaseServer {
    $beforeRoutesInit(): void {
        this.registerMiddlewares();
    }
}
