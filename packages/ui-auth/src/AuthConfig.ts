import { z } from 'zod';
import { httpUrl } from '@radoslavirha/ui-runtime';

/**
 * The `auth` block of a UI's runtime config.json.
 *
 * REQUIRED, not optional — decided 2026-09-05. An app whose config lacks it
 * must fail at deploy time in the validating initContainer, not silently render
 * without a login button. See the auth design doc.
 *
 * Nothing here is secret: a public client has no secret to hide, which is why
 * these keys are safe in a file nginx serves to the browser.
 *
 * `httpUrl` comes from ui-runtime rather than being redefined here. It already
 * exists for exactly this hazard — plain `z.url()` accepts `"localhost:4002"`,
 * parsing it as protocol `localhost:` — and `apiBaseURL` in the same config file
 * is already validated by it. A second, laxer spelling in this package would
 * mean one config file checked by two different rules.
 */
export const AuthConfigSchema = z.object({
    /**
     * Per-application issuer, WITH its trailing slash — `issuer_mode` is
     * `per_provider`, so this differs per deployment the way apiBaseURL does.
     * Never stripped: the trailing slash is part of the value compared to `iss`.
     */
    issuer: httpUrl().refine(value => value.endsWith('/'), {
        message: 'issuer must keep its trailing slash'
    }),
    clientId: z.string().min(1),
    /**
     * Asserted rather than defaulted, because both omissions fail silently:
     * no `roles` means the API denies everything, and no `profile` means `aud`
     * arrives as a bare string instead of an array.
     */
    scope: z
        .string()
        .refine(value => value.split(' ').includes('roles'), { message: 'scope must include `roles`' })
        .refine(value => value.split(' ').includes('profile'), { message: 'scope must include `profile`' }),
    /** Absolute and spelled out. Matching at the IdP is strict; a derived value fails opaquely. */
    redirectUri: httpUrl(),
    postLogoutRedirectUri: httpUrl()
});

export type AuthConfig = z.infer<typeof AuthConfigSchema>;
