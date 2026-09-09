/**
 * Roles this service recognises on a caller's `Principal`.
 *
 * The values are the strings Authentik puts in the `roles` claim —
 * `<application>.<role>`, where the application short name comes from the
 * blueprint and is the same in every environment. Declared here rather than
 * written inline so a typo is a compile error instead of a route nobody can
 * reach: a misspelled role never matches, and the failure looks exactly like a
 * caller who legitimately lacks it.
 *
 * The counterpart of `AuthMethod`, and a different question. A method says
 * *which set of callers* may reach a route; a role says *what a caller may do*
 * once identified. Both are the service's own vocabulary.
 *
 * **Not all roles are represented here** — only the ones a route actually
 * requires. `reader` exists in the IdP for this application and appears in
 * tokens; it earns an entry the day a route asks for it.
 */
export enum AuthRole {
    /**
     * Endpoints that are not part of ordinary use — no UI reaches them, and
     * they act on a device directly rather than reading a record.
     */
    Admin = 'miot-bridge.admin'
}
