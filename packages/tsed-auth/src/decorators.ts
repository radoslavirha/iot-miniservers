import { useDecorators } from '@tsed/core';
import { UseAuth } from '@tsed/platform-middlewares';
import { ParamTypes, UseParam, UsePipe } from '@tsed/platform-params';
import { AuthGuard } from './AuthGuard.js';
import { PrincipalPipe } from './PrincipalPipe.js';

/**
 * Requires a verified caller.
 *
 * **Apply it to the controller class, not to individual methods.** Ts.ED's
 * `UseAuth` decorates every method of a class it is put on, so one decorator
 * protects the whole controller and a route added tomorrow is protected the
 * moment it is written. Protecting method by method is the arrangement where
 * the next route is one forgotten decorator away from being public.
 *
 * What "requires" means depends on the configured mode: in `disabled` nothing
 * is checked, in `permissive` the outcome is counted and the request proceeds,
 * and only in `enforced` is anyone actually refused. The decorator does not
 * change per mode — the whole point is that the same code runs in all three.
 */
export const Authenticate = (): ClassDecorator & MethodDecorator =>
    UseAuth(AuthGuard) as ClassDecorator & MethodDecorator;

/**
 * Opens one endpoint to anonymous callers.
 *
 * The explicit allowlist: `GET /r/:slug` resolving a QR code, `/health` for the
 * probes. It sits on the route it opens, so reviewing what is public is reading
 * the controller rather than cross-referencing a config file.
 *
 * It only has meaning under an `@Authenticate()`d controller — on an
 * unprotected one there is nothing to opt out of.
 */
export const Anonymous = (): MethodDecorator =>
    UseAuth(AuthGuard, { anonymous: true }) as MethodDecorator;

/**
 * Injects the verified caller, or `undefined`.
 *
 * `Principal | undefined` and never a fabricated stand-in. In `disabled`, and
 * in `permissive` with no credential, there genuinely is nobody — and a fake
 * subject written to an audit column is worse than an empty one, because later
 * it cannot be told apart from a real one.
 */
export const CurrentPrincipal = (): ParameterDecorator =>
    useDecorators(
        UseParam({ paramType: ParamTypes.$CTX, useMapper: false, useValidation: false }),
        UsePipe(PrincipalPipe)
    );
