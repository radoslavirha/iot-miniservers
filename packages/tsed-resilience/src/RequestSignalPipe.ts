import { Injectable, ProviderScope, Scope } from '@tsed/di';
import type { PlatformContext } from '@tsed/platform-http';
import type { PipeMethods } from '@tsed/schema';
import { getRequestSignal } from './getRequestSignal.js';

/**
 * Pipe backing the {@link RequestSignal} decorator. Ts.ED extracts the `$CTX`
 * value first, then hands it here to be mapped to the request-lifecycle signal.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class RequestSignalPipe implements PipeMethods<PlatformContext, AbortSignal> {
    public transform(ctx: PlatformContext): AbortSignal {
        return getRequestSignal(ctx);
    }
}
