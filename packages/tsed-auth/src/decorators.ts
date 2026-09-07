import { Store, decorateMethodsOf, decoratorTypeOf, DecoratorTypes, useDecorators } from '@tsed/core';
import { UseAuth } from '@tsed/platform-middlewares';
import { ParamTypes, UseParam, UsePipe } from '@tsed/platform-params';
import { Returns, Security } from '@tsed/schema';
import { SwaggerSecurityScheme } from '@radoslavirha/tsed-swagger';
import { AuthGuard } from './AuthGuard.js';
import type { AuthGuardOptions } from './AuthGuard.js';
import { PrincipalPipe } from './PrincipalPipe.js';

/**
 * The OpenAPI security scheme these decorators reference.
 *
 * Taken from `@radoslavirha/tsed-swagger`, which owns the scheme and maps it to
 * `{ type: http, scheme: bearer, bearerFormat: JWT }` under
 * `components.securitySchemes`. Re-exported so a service can name it without a
 * second import, and so the operation-level reference and the document-level
 * definition are provably the same value rather than two matching literals.
 */
export const BEARER_JWT_SCHEME = SwaggerSecurityScheme.BEARER_JWT;

/**
 * Requires a verified caller, and says so in the OpenAPI document.
 *
 * **Apply it to the controller class, not to individual methods.** Ts.ED's
 * `UseAuth` decorates every method of a class it is put on, so one decorator
 * protects the whole controller and a route added tomorrow is protected the
 * moment it is written. Protecting method by method is the arrangement where the
 * next route is one forgotten decorator away from being public.
 *
 * Everything it adds to the document is standard OpenAPI 3: a `security`
 * requirement naming the bearer scheme, and the two responses a caller can
 * actually receive from the guard. No vendor extensions, nothing invented.
 *
 * ```ts
 * @Controller('/qr-codes')
 * @Authenticate(AuthMethod.Idp)
 * export class QrCodeController { }
 * ```
 *
 * **The method is required, and it names callers rather than a mechanism.** It
 * says which set of callers the endpoint admits; how their credentials are
 * checked is the `type` inside that entry's configuration. So an endpoint can
 * admit a deployment's people without also admitting its cluster's
 * ServiceAccount tokens, even though both arrive as JWTs.
 *
 * `AuthMethod` above is the **service's own** enum, not this package's — which
 * callers a deployment admits is not something a shared package can name. Since
 * that same enum keys the configuration,
 * `createAuthConfigSchema(Object.values(AuthMethod))` makes a deployment that
 * never configured a method fail at boot instead of at the first request.
 */
export const Authenticate = (method: string): ClassDecorator & MethodDecorator =>
    useDecorators(UseAuth(AuthGuard, { method }), documentAuth()) as ClassDecorator & MethodDecorator;

/**
 * Opens one endpoint to anonymous callers.
 *
 * The explicit allowlist: `GET /r/:slug` resolving a QR code, `/health` for the
 * probes. It sits on the route it opens, so reviewing what is public means
 * reading the controller rather than cross-referencing a config file.
 *
 * In the document it emits `security: []`, which is OpenAPI's own way of saying
 * "this operation overrides the requirement and needs nothing" — so Swagger UI
 * stops offering the padlock on exactly the routes that ignore it.
 */
export const Anonymous = (): MethodDecorator =>
    useDecorators(UseAuth(AuthGuard, { anonymous: true }), Security([])) as MethodDecorator;

/**
 * Injects the verified caller, or `undefined`.
 *
 * `Principal | undefined` and never a fabricated stand-in. In `disabled`, and in
 * `permissive` with no credential, there genuinely is nobody — and a fake subject
 * written to an audit column is worse than an empty one, because later it cannot
 * be told apart from a real one.
 */
export const CurrentPrincipal = (): ParameterDecorator =>
    useDecorators(
        UseParam({ paramType: ParamTypes.$CTX, useMapper: false, useValidation: false }),
        UsePipe(PrincipalPipe)
    );

/**
 * Adds the security requirement and the guard's own responses.
 *
 * Applied per method rather than once on the class, because a method already
 * marked `@Anonymous()` must keep its `security: []` override. Method decorators
 * run before class decorators, so by the time this reaches a class the anonymous
 * marker is already in the store and can be honoured — which is what keeps the
 * padlock off the routes that do not need one.
 */
const documentAuth = (): ClassDecorator & MethodDecorator =>
    ((...args: Parameters<MethodDecorator>) => {
        const type = decoratorTypeOf(args);

        if (type === DecoratorTypes.CLASS) {
            decorateMethodsOf(args[0] as unknown as new (...a: unknown[]) => unknown, documentMethod());
            return;
        }

        return documentMethod()(...args) as void;
    }) as ClassDecorator & MethodDecorator;

const documentMethod = (): MethodDecorator =>
    ((target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const options = Store.fromMethod(target, propertyKey).get(AuthGuard) as AuthGuardOptions | undefined;

        // `@Anonymous()` has already written `security: []`. Adding the scheme
        // now would put the padlock back on a route that ignores it.
        if (options?.anonymous === true) {
            return descriptor;
        }

        return useDecorators(
            Security(BEARER_JWT_SCHEME),
            Returns(401).Description('Authentication required, or the credential was refused.'),
            Returns(503).Description('The credential could not be verified — try again.')
        )(target, propertyKey, descriptor) as PropertyDescriptor;
    }) as MethodDecorator;
