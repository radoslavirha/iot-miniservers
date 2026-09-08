import { Store, decorateMethodsOf, decoratorTypeOf, DecoratorTypes, useDecorators } from '@tsed/core';
import { UseAuth } from '@tsed/platform-middlewares';
import { ParamTypes, UseParam, UsePipe } from '@tsed/platform-params';
import { Returns, Security } from '@tsed/schema';
import { SwaggerSecurityScheme } from '@radoslavirha/tsed-swagger';
import { AuthGuard, encodeMethods } from './AuthGuard.js';
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
 * **At least one method is required, and they name callers rather than a
 * mechanism.** A method says which set of callers the endpoint admits; how their
 * credentials are checked is the `type` inside that entry's configuration. So an
 * endpoint can admit a deployment's people without also admitting its cluster's
 * ServiceAccount tokens, even though both arrive as JWTs.
 *
 * **Several methods means "any of these", tried in the order given**, and each
 * one looks for its own credential — so listing `Idp` before `ApiKey` does not
 * refuse a caller who sent only a key. The first that verifies wins; if none
 * does, the refusal reports the most telling failure rather than the last, so a
 * JWKS outage answers `503` instead of being overwritten by a later "no key
 * present" `401`.
 *
 * ```ts
 * @Authenticate(AuthMethod.Idp, AuthMethod.ApiKey)   // either
 * ```
 *
 * **A method-level `@Authenticate` replaces the class-level one; it does not add
 * to it.** So widening a route is always written on the route, in full, and can
 * never be an emergent property of two decorators meeting. If an endpoint under
 * a class-level `Idp` should also take an API key, it names both.
 *
 * `AuthMethod` above is the **service's own** enum, not this package's — which
 * callers a deployment admits is not something a shared package can name. Since
 * that same enum keys the configuration,
 * `createAuthConfigSchema(Object.values(AuthMethod))` makes a deployment that
 * never configured a method fail at boot instead of at the first request.
 */
export const Authenticate = (...methods: string[]): ClassDecorator & MethodDecorator =>
    useDecorators(UseAuth(AuthGuard, { methods: encodeMethods(methods) }), documentAuth()) as ClassDecorator & MethodDecorator;

/**
 * Requires the caller to hold at least one of these roles.
 *
 * Authorization, on top of the authentication `@Authenticate` performs — so it
 * is a `403`, never a `401`. The credential is good; re-authenticating cannot
 * help, and telling the caller to sign in again would send them round a loop
 * that has no exit.
 *
 * Works on a class, on a method, or on both:
 *
 * ```ts
 * @Controller('/qr-codes')
 * @Authenticate(AuthMethod.Idp)
 * @RequireRoles('qr-manager.reader')      // the floor for every route here
 * export class QrCodeController {
 *     @Get('/')
 *     list() {}                            // reader
 *
 *     @Delete('/:id')
 *     @RequireRoles('qr-manager.admin')    // reader AND admin
 *     remove() {}
 * }
 * ```
 *
 * **"Or" within one decorator, "and" between them.** `('a', 'b')` reads as
 * "a or b". Stacking a second decorator adds a requirement rather than replacing
 * the first, so a method can only ever narrow what its class allowed — never
 * widen it.
 *
 * That is not a convention, it is the merge Ts.ED already performs. Endpoint
 * options concatenate arrays, so a flat `string[]` would have turned the example
 * above into `['qr-manager.reader', 'qr-manager.admin']` and — under "any one is
 * enough" — let a reader delete. Storing each decorator's roles as its own inner
 * array turns the same concatenation into the safe reading. Measured against
 * `Store.fromMethod` before this was written, both ways.
 *
 * **Exact strings, no hierarchy.** Whether `admin` implies `reader` belongs to
 * whoever issues the roles: this deployment answers it with Authentik group
 * parentage, so a token already lists every role its holder effectively has and
 * this stays a set-membership test. Implying it here would make the token stop
 * describing what its holder can do, and oblige every other consumer to keep the
 * same ordering table.
 *
 * In the document it adds a `403` whose description names the effective
 * requirement. That is plain OpenAPI 3 and shows up in Swagger UI. The tempting
 * alternative — putting the roles in the security requirement as
 * `{ BEARER_JWT: ['qr-manager.admin'] }` — is **invalid** here: the spec requires
 * that array to be empty for a scheme of `type: http`, and `BEARER_JWT` is one.
 * It would render, and it would be wrong.
 */
export const RequireRoles = (...roles: string[]): ClassDecorator & MethodDecorator =>
    useDecorators(UseAuth(AuthGuard, { roles: [roles] }), documentRoles()) as ClassDecorator & MethodDecorator;

/**
 * Puts the `403` on every method, reading the *effective* requirement.
 *
 * Same shape as `documentAuth` and for the same reason: a class decorator has to
 * reach the methods itself. It reads the store rather than the arguments it was
 * called with, so a method carrying its own `@RequireRoles` documents the
 * combined requirement instead of only the half nearest to it.
 */
const documentRoles = (): ClassDecorator & MethodDecorator =>
    ((...args: Parameters<MethodDecorator>) => {
        if (decoratorTypeOf(args) === DecoratorTypes.CLASS) {
            decorateMethodsOf(args[0] as unknown as new (...a: unknown[]) => unknown, documentRolesMethod());
            return;
        }

        return documentRolesMethod()(...args) as void;
    }) as ClassDecorator & MethodDecorator;

const documentRolesMethod = (): MethodDecorator =>
    ((target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
        const options = Store.fromMethod(target, propertyKey).get(AuthGuard) as AuthGuardOptions | undefined;

        // `@Anonymous()` wins: a route nobody has to authenticate for cannot
        // meaningfully refuse anyone for lacking a role.
        if (options?.anonymous === true) {
            return descriptor;
        }

        const requirements = (options?.roles ?? []).filter((anyOf) => anyOf.length > 0);
        if (requirements.length === 0) {
            return descriptor;
        }

        return Returns(403).Description(describeRoles(requirements))(
            target,
            propertyKey,
            descriptor
        ) as PropertyDescriptor;
    }) as MethodDecorator;

/**
 * The requirement as a sentence, so the document says what the guard does.
 *
 * One entry reads "one of: a, b"; several read "(a or b) and (c)", which is the
 * only spelling that makes the nesting visible to somebody holding a token and
 * wondering why they got a `403`.
 */
const describeRoles = (requirements: readonly (readonly string[])[]): string => {
    if (requirements.length === 1) {
        const [only] = requirements;
        return only!.length === 1 ? `Requires role ${only![0]}.` : `Requires one of: ${only!.join(', ')}.`;
    }

    return `Requires ${requirements.map((anyOf) => `(${anyOf.join(' or ')})`).join(' and ')}.`;
};

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
