export interface IAuthStrategy {
    /**
     * Returns a map of named credential values to be interpolated into
     * transport placeholders. Keys match the `{{name}}` tokens in transport config.
     *
     * Implementations must cache credentials internally and only re-acquire
     * when `invalidate()` has been called.
     */
    getCredentials(): Promise<Record<string, string>>;

    /**
     * Clears any cached credentials so that the next `getCredentials()` call
     * re-acquires them from the source. Called automatically on HTTP 401.
     */
    invalidate(): void;
}
