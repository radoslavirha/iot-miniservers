import { Controller, Scope, ProviderScope } from '@tsed/di';
import { Context, PathParams } from '@tsed/platform-params';
import { PlatformContext } from '@tsed/platform-http';
import { Description, Get, Pattern, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { RequestCancellation } from '@radoslavirha/tsed-resilience';
import { SLUG_PATTERN } from '../constants.js';
import { RedirectHandler } from '../handlers/RedirectHandler.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

/**
 * Public redirect endpoint. Static admin paths (`/qr-codes`, Swagger UI at `/`)
 * win the route match before this dynamic `:slug` parameter, so this controller
 * only handles top-level scan targets. The `@Pattern` decorator rejects any
 * input that does not match the slug shape with 400 before the handler runs.
 */
@Description('Public redirect endpoint. Resolves a 4-character slug to its target URL.')
@Controller('/')
@Scope(ProviderScope.SINGLETON)
@Docs(SwaggerDocs.API)
export class RedirectController {
    constructor(
        private readonly redirectHandler: RedirectHandler
    ) {}

    @Get('/:slug')
    @Description('Resolves the slug and returns a 302 redirect to the current target URL. Returns 404 when the slug is unknown or has been deactivated, 400 when the slug format is invalid.')
    @Returns(302)
    @Returns(404)
    @Returns(400)
    public async redirect(
        @PathParams('slug') @Pattern(SLUG_PATTERN) slug: string,
        @Context() ctx: PlatformContext
    ): Promise<void> {
        // Resolve the request-scoped cancellation for this request and thread its
        // signal down so a client disconnect aborts the DB lookup.
        const cancellation = ctx.injector.invoke<RequestCancellation>(RequestCancellation, { locals: ctx.container });
        const { targetURL } = await this.redirectHandler.execute(slug, cancellation.signal);
        ctx.response.redirect(302, targetURL);
    }
}
