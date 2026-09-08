import { z } from 'zod';

/**
 * A header or query parameter whose value is fixed in configuration.
 *
 * The shape a `strategy: none` provider uses: an API key that is simply a
 * literal, arriving from a Secret through the deployment's own templating. No
 * credential is produced at request time, so there is nothing to name.
 */
const StaticEntrySchema = z.strictObject({
    name: z.string().min(1),
    value: z.string()
});

/**
 * A header or query parameter carrying a credential the auth strategy produced.
 *
 * **`credential` names one of the keys the strategy returns** — for
 * `token-exchange` those are the `as` names from `tokenExtractor`, so any field
 * of any token response can be routed to any header without a code change. Two
 * entries naming two different credentials put a token in one header and a
 * refresh token in another.
 *
 * `prefix` and `suffix` wrap it. That covers `Bearer `, and a cookie's trailing
 * `; Path=/`, which is the only reason `suffix` exists.
 *
 * **Deliberately not a template string.** The previous shape was
 * `value: 'Bearer {{credential}}'`, interpolated here. It expressed one thing
 * more — two credentials inside a single value — that nothing has ever used, and
 * it cost a placeholder syntax that any config renderer downstream may claim as
 * its own. This deployment renders these files with Jinja2, whose `{{ }}` is
 * exactly that syntax and whose default for an unknown name is the empty string:
 * `Bearer {{value}}` would have rendered as `Bearer `, a silent 401 rather than a
 * loud failure. Naming the credential in its own field means there is no
 * placeholder for any renderer, present or future, to consume.
 *
 * If a value ever genuinely needs two credentials, a template field can be added
 * beside this one — additive, and by then its real shape will be known.
 */
const CredentialEntrySchema = z.strictObject({
    name: z.string().min(1),
    credential: z.string().min(1),
    prefix: z.string().optional(),
    suffix: z.string().optional()
});

/**
 * Credential-bearing first: the two are told apart by which keys they carry, and
 * `strictObject` makes that unambiguous — an entry with `credential` cannot parse
 * as static, and one with `value` cannot parse as credential-bearing.
 */
export const TransportEntrySchema = z.union([CredentialEntrySchema, StaticEntrySchema]);

export const TransportHeaderSchema = TransportEntrySchema;
export const TransportQueryParamSchema = TransportEntrySchema;

export const TransportSchema = z.object({
    headers: z.array(TransportHeaderSchema).optional(),
    queryParams: z.array(TransportQueryParamSchema).optional()
});

export type TransportStaticEntry = z.infer<typeof StaticEntrySchema>;
export type TransportCredentialEntry = z.infer<typeof CredentialEntrySchema>;
export type TransportEntry = z.infer<typeof TransportEntrySchema>;
export type TransportHeader = z.infer<typeof TransportHeaderSchema>;
export type TransportQueryParam = z.infer<typeof TransportQueryParamSchema>;
export type TransportConfig = z.infer<typeof TransportSchema>;
