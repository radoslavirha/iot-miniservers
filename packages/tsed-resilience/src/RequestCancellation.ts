import { InjectContext, Injectable, ProviderScope, Scope } from '@tsed/di';
import { PlatformContext } from '@tsed/platform-http';

/**
 * Request-scoped cancellation. Exposes an {@link AbortSignal} tied to the HTTP
 * request lifecycle: it aborts when the client disconnects (the underlying Node
 * request emits `close`/`aborted`). Thread the signal down into outbound HTTP
 * and database calls so that abandoned requests stop doing work.
 *
 * Because repositories/services are typically `SINGLETON`, read the signal at
 * the request-scoped layer (controller/handler) and pass it down explicitly:
 *
 * @example
 * ```ts
 * @Controller('/')
 * export class MyController {
 *   constructor(private readonly cancellation: RequestCancellation, private readonly handler: MyHandler) {}
 *
 *   @Get('/:id')
 *   get(@PathParams('id') id: string) {
 *     // request signal + a 2s per-operation timeout
 *     return this.handler.execute(id, this.cancellation.withTimeout(2000));
 *   }
 * }
 * ```
 */
@Injectable()
@Scope(ProviderScope.REQUEST)
export class RequestCancellation {
    @InjectContext()
    protected $ctx?: PlatformContext;

    private readonly controller = new AbortController();

    /**
     * Ts.ED lifecycle hook — runs once the request context has been injected.
     * Wires the abort to the underlying request's `close`/`aborted` events.
     */
    public $onInit(): void {
        const raw = this.$ctx?.request?.raw as { once?: (event: string, listener: () => void) => void } | undefined;
        if (raw && typeof raw.once === 'function') {
            const onClose = (): void => this.abort();
            raw.once('close', onClose);
            raw.once('aborted', onClose);
        }
    }

    /** Aborts when the client disconnects (or {@link abort} is called). */
    public get signal(): AbortSignal {
        return this.controller.signal;
    }

    /**
     * Returns a signal that aborts on **either** client disconnect or after `ms`
     * — a per-operation timeout layered on top of the request lifecycle. Uses
     * the native `AbortSignal.any`/`AbortSignal.timeout` (Node >= 24).
     */
    public withTimeout(ms: number): AbortSignal {
        return AbortSignal.any([this.controller.signal, AbortSignal.timeout(ms)]);
    }

    /** Manually abort the request signal (idempotent). */
    public abort(reason?: unknown): void {
        if (!this.controller.signal.aborted) {
            this.controller.abort(reason);
        }
    }
}
