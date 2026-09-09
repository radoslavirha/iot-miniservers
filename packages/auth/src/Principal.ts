/**
 * Who is making a request, once some verifier has vouched for them.
 *
 * Every mechanism resolves to this one shape — IdP JWT, Kubernetes apiserver
 * JWT, API key, MQTT client identity. Business logic, audit fields and OTel
 * attributes consume `Principal` and never learn which mechanism produced it,
 * so adding a mechanism later is a new verifier returning this shape rather
 * than a change to anything downstream.
 *
 * It is also what keeps the design Kubernetes-agnostic: a ServiceAccount token
 * is not a special case here, it is "an issuer whose JWKS fetch happens to need
 * a bearer token", which is transport configuration. Delete that config row and
 * the same binary runs on a VM.
 */
export interface Principal {
    /** Stable identifier for the caller. `sub` for a JWT. */
    readonly subject: string;
    /**
     * Which caller class this is. Drives nothing on its own — it exists so that
     * audit records and metrics can tell a human apart from a service without
     * parsing the subject.
     */
    readonly kind: PrincipalKind;
    /** Human-friendly name, when the credential carries one. Never an identifier. */
    readonly displayName?: string;
    /**
     * Roles as the trust source stated them, uninterpreted. Authorization is
     * P1.7 and deliberately not modelled here.
     */
    readonly roles: readonly string[];
    /** Which trust source vouched — the `iss` value, not a friendly label. */
    readonly issuer: string;
}

export type PrincipalKind = 'human' | 'service' | 'device';
