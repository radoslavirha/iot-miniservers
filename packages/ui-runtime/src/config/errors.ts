/**
 * Why a runtime config could not be used.
 *
 * Callers branch on this rather than matching message text, so the guidance
 * shown to a developer can differ from the guidance shown to an operator.
 */
export type RuntimeConfigErrorReason =
    /** The file was not served (404, or any non-2xx). */
    | 'not-found'
    /** The body was not JSON — usually an SPA fallback returning index.html. */
    | 'not-json'
    /** Valid JSON, but the schema rejected it. */
    | 'invalid'
    /** The request never completed — offline, DNS, TLS. */
    | 'network';

export class RuntimeConfigError extends Error {
    public readonly reason: RuntimeConfigErrorReason;

    public constructor(reason: RuntimeConfigErrorReason, message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'RuntimeConfigError';
        this.reason = reason;
    }
}
