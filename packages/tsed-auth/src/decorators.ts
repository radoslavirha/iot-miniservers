import { Store, decorateMethodsOf, decoratorTypeOf, DecoratorTypes, useDecorators } from '@tsed/core';
import { UseAuth } from '@tsed/platform-middlewares';
import { ParamTypes, UseParam, UsePipe } from '@tsed/platform-params';
import { Returns, Security } from '@tsed/schema';
import { AuthGuard } from './AuthGuard.js';
import type { AuthGuardOptions } from './AuthGuard.js';
import { PrincipalPipe } from './PrincipalPipe.js';

/**
 * Name of the OpenAPI security scheme these decorators reference.
 *
 * It matches `SwaggerSecurityScheme.BEARER_JWT` from `@radoslavirha/tsed-swagger`,
 * which defines the scheme itself as `{ type: http, scheme: bearer, bearerFormat:
 * JWT }`. The literal is repeated here rather than imported so this package does
 * not depend on the swagger one — a service that documents nothing still gets a
 * working guard, and the two only have to agree on a string that is part of the
 * published OpenAPI document anyway.
 */
export const BEARER_JWT_SCHEME = 'BEARER_JWT';

/**
 * Requires a verified caller, and says so in the OpenAPI document.
 *
 * **Apply it to the controller class, not to individual methods.** Ts.ED's
 * `UseAuth` decorates every method of a class it is put on, so one decorator
 * protects the whole controller and a route added tomorrow is protected the
 * moment it is written. Protecting method by method is the arrangement where the
 * next route is one forgotten decorator away from being public.
 *
 * What "requires" means depends on the configured mode: in `disabled` nothing is
 * checked, in `permissive` the outcome is counted and the request proceeds, and
 * only in `enforced` is anyone refused. The decorator does not change per mode —
 * the whole point is that the same code runs in all three.
 *
 * Everything it adds to the document is standard OpenAPI 3: a `security`
 * requirement naming the bearer scheme, and the two responses a caller can
 * actually receive from the guard. No vendor extensions, nothing invented.
 */
export const Authenticate = (): ClassDecorator & MethodDecorator =>
    useDecorators(UseAuth(AuthGuard), documentAuth()) as ClassDecorator & MethodDecorator;

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
