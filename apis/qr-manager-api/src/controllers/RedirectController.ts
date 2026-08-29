import { Controller, Scope, ProviderScope } from '@tsed/di';
import { Context, PathParams } from '@tsed/platform-params';
import { PlatformContext } from '@tsed/platform-http';
import { Description, Get, Pattern, Returns } from '@tsed/schema';
import { Docs } from '@tsed/swagger';
import { RequestSignal } from '@radoslavirha/tsed-resilience';
import { SLUG_PATTERN } from '../constants.js';
import { RedirectHandler } from '../handlers/RedirectHandler.js';
import { SwaggerDocs } from '../models/SwaggerDocs.enum.js';

/**
 * Public redirect endpoint, mounted at `/r` rather than at the root. Mount order
 * is irrelevant here: `/r/:slug` cannot shadow `/health`, `/qr-codes` or the
 * Swagger UI, because it is one segment deeper than all of them.
 *
 * **The printed URL does not contain the `/r`.** A label reads
 * `http://qr.home/x7k2`; a Traefik `addPrefix` middleware on the `qr.home`
 * HTTPRoute — `homelab`,
 * `gitops/k8s-manifests/server1/qr-manager-api/production/` — prepends it, so the
 * request arrives here as `/r/x7k2`. Adding the prefix at the gateway rather than
 * to the printed string is what keeps the QR physically small.
 *
 * Two consequences worth knowing before "fixing" anything:
 *
 * - `redirect.baseURL` is `http://qr.home` with **no** `/r`, and that is correct.
 *   Adding one there would double the prefix and break every printed label. A
 *   host that has no such middleware (the shared `api.<domain>/iot/qr-manager`
 *   route) must carry the `/r` in its `baseURL` instead.
 * - `qr.home` is redirect-only because of this: `/qr-codes` and `/api/docs`
 *   arrive prefixed and match nothing. Admin access lives on the other route.
 *
 * Full rationale, including why the gateway could not simply match the slug
 * path instead: `homelab`,
 * `gitops/k8s-manifests/server1/qr-manager-api/production/Middleware.addprefix-qr.yaml`.
 *
 * The `@Pattern` decorator rejects any input that does not match the slug shape
 * with 400 before the handler runs.
 */
@Description('Public redirect endpoint. Resolves a 4-character slug to its target URL.')
@Controller('/r')
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
        @RequestSignal() signal: AbortSignal,
        @Context() ctx: PlatformContext
    ): Promise<void> {
        // The signal aborts if the client disconnects, so a scan that is
        // abandoned mid-flight cancels the DB lookup instead of completing it.
        const { targetURL } = await this.redirectHandler.execute(slug, signal);
        ctx.response.redirect(302, targetURL);
    }
}
