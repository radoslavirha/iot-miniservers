import { Inject, Injectable, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import type { RemoteInfo } from 'dgram';
import { UDPHandlerToken } from '../tokens/UDPHandlerToken.js';
import type { IUdpVersionHandler } from './IUdpVersionHandler.js';
import type { UdpCommandRequestModel } from '../models/UdpCommandRequestModel.js';

/**
 * Routes incoming UDP commands to the correct versioned handler.
 * All handlers registered with @Injectable({ type: UDPHandlerToken }) are injected automatically.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class UdpCommandRouter {
    constructor(@Inject(UDPHandlerToken) private readonly handlers: IUdpVersionHandler[]) {}

    async route(request: UdpCommandRequestModel, rinfo: RemoteInfo): Promise<string> {
        const handler = this.handlers.find(h => h.version === request.version);

        if (!handler) {
            $log.warn({ event: 'UDP_UNSUPPORTED_VERSION', message: `Unsupported API version: ${request.version}.` });
            return JSON.stringify({ success: false, error: `Unsupported API version: ${request.version}` });
        }

        return handler.handle(request, rinfo);
    }
}
