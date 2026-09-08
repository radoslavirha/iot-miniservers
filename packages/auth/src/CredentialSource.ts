/**
 * Where a verifier looks for its credential, without knowing what carried it.
 *
 * The narrowest thing a verifier needs, so that `packages/auth` never sees an
 * HTTP request. The Ts.ED guard adapts `ctx.request`; an MQTT hook adapts a
 * CONNECT packet; a test passes an object literal. Widen this only when a real
 * verifier cannot be written without more — every field added here is a field
 * every future transport has to be able to answer.
 *
 * Header lookup is **case-insensitive**, because HTTP header names are and a
 * verifier asking for `authorization` must not depend on how the transport
 * happened to spell it.
 */
export interface CredentialSource {
    header(name: string): string | undefined;
}

/**
 * A `CredentialSource` over a plain record of headers.
 *
 * For transports that already hold headers as an object, and for tests. Keys are
 * lowercased on the way in so lookup is case-insensitive whatever the caller did.
 */
export const credentialSourceOf = (headers: Readonly<Record<string, string | undefined>>): CredentialSource => {
    const lower = new Map(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));

    return { header: (name: string) => lower.get(name.toLowerCase()) };
};
