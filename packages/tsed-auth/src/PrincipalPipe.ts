import type { Principal } from '@radoslavirha/auth';
import { Injectable, ProviderScope, Scope } from '@tsed/di';
import type { PlatformContext } from '@tsed/platform-http';
import type { PipeMethods } from '@tsed/schema';
import { principalOf } from './AuthGuard.js';

/**
 * Pipe backing the {@link CurrentPrincipal} decorator. Ts.ED extracts the
 * `$CTX` value first, then hands it here to be mapped to whatever the guard
 * parked on the context.
 *
 * Resolving per request through the parameter pipeline, rather than through a
 * request-scoped provider, is what lets a `SINGLETON` controller take a
 * principal as an argument.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class PrincipalPipe implements PipeMethods<PlatformContext, Principal | undefined> {
    public transform(ctx: PlatformContext): Principal | undefined {
        return principalOf(ctx);
    }
}
