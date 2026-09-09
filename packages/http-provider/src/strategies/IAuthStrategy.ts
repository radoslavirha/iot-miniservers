export interface IAuthStrategy {
    /**
     * Returns a map of named credential values. Each key is a name a transport
     * entry may claim through its `credential` field — for `token-exchange`
     * those are the `as` names from `tokenExtractor`, so a strategy can return
     * several and the configuration decides which header each one lands in.
     *
     * Implementations **may** cache internally, re-acquiring after
     * `invalidate()`. `KubernetesServiceAccountStrategy` deliberately does not:
     * it re-reads the projected token file each time, which is what picks up the
     * kubelet's rotation for free. A cache there would have to be expiry-aware to
     * be correct.
     */
    getCredentials(): Promise<Record<string, string>>;

    /**
     * Clears any cached credentials so that the next `getCredentials()` call
     * re-acquires them from the source. Called automatically on HTTP 401.
     */
    invalidate(): void;
}
