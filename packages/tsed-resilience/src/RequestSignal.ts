import { useDecorators } from '@tsed/core';
import { ParamTypes, UseParam, UsePipe } from '@tsed/platform-params';
import { RequestSignalPipe } from './RequestSignalPipe.js';

/**
 * Injects an {@link AbortSignal} tied to the HTTP request lifecycle into a
 * controller (or middleware) parameter. The signal aborts when the client
 * disconnects — thread it down into outbound HTTP and database calls so that
 * abandoned requests stop doing work.
 *
 * Unlike a `@Scope(ProviderScope.REQUEST)` provider, this works in a
 * `SINGLETON` controller: the value is resolved per request by the parameter
 * pipeline rather than at injection time.
 *
 * Per-operation deadlines belong in the resilience policy that wraps the call
 * (`createResiliencePolicy({ timeout: { ms } })` from `@radoslavirha/resilience`),
 * which derives its own timeout signal from the one passed here.
 *
 * @example
 * ```ts
 * @Controller('/')
 * @Scope(ProviderScope.SINGLETON)
 * export class RedirectController {
 *   constructor(private readonly handler: RedirectHandler) {}
 *
 *   @Get('/:slug')
 *   public redirect(
 *     @PathParams('slug') slug: string,
 *     @RequestSignal() signal: AbortSignal
 *   ) {
 *     return this.handler.execute(slug, signal);
 *   }
 * }
 * ```
 */
export function RequestSignal(): ParameterDecorator {
    return useDecorators(
        UseParam({ paramType: ParamTypes.$CTX, useMapper: false, useValidation: false }),
        UsePipe(RequestSignalPipe)
    );
}
