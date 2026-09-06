/**
 * How hard the application enforces authentication.
 *
 * Three modes rather than an on/off switch, because "off" and "on" cannot
 * express the state a service is actually in while it is being onboarded:
 * verifying tokens and reporting on them, without yet refusing anyone.
 *
 * - `disabled`   — no credential is read. There is no `Principal`.
 * - `permissive` — a credential is verified when present and the outcome is
 *                  observed, but a request is never refused. A request with no
 *                  credential has no `Principal` and proceeds.
 * - `enforced`   — a request without a valid credential is refused.
 *
 * `permissive` is the mode that makes onboarding safe: it answers "how many
 * callers would this break" with real traffic instead of a guess.
 *
 * A frozen object plus a union type rather than a TypeScript `enum`, unlike
 * `AuthStrategy` in `http-provider`. The deciding difference is that this value
 * **arrives as a raw string from a `config/*.json` file**: a string enum is not
 * assignable from a plain string, so every config boundary and every test would
 * have to import the enum to name a value it already has. The union is also
 * erasable syntax, which an enum is not.
 */
export const AuthMode = {
    Disabled: 'disabled',
    Permissive: 'permissive',
    Enforced: 'enforced'
} as const;

export type AuthMode = (typeof AuthMode)[keyof typeof AuthMode];
