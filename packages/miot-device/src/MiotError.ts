/**
 * The typed failure of a miot call.
 *
 * ### Why this exists
 *
 * miIO is JSON-RPC-shaped: a request is `{ id, method, params }` and a rejection comes back as a
 * real response containing `error: { code, message }`. The device is a blackbox with an incomplete
 * published spec, so **that code is the only thing that ever says why it said no** — `-4004` for a
 * property it does not implement reads completely differently from a timeout, and the difference
 * decides whether the fix is in `model-property-overrides`, in the published spec, or nowhere.
 *
 * Before this class every one of those failures was flattened into `new Error('Device error -4004:
 * ...')` and then re-wrapped a second time by the stamp-refresh retry, so the caller received a
 * bare `Error` whose only machine-readable content was a substring of its message. Instrumentation
 * built on top of that can say "the call failed" and nothing else.
 *
 * ### Deliberately no OpenTelemetry dependency
 *
 * This package takes an injected logger and nothing else. {@link kind} and {@link code} are plain
 * data; the app maps them onto span attributes and metrics at the seam that still knows which
 * device is being addressed.
 */

/** No response within the transport timeout. The device said nothing at all. */
export const MIOT_ERROR_TIMEOUT = 'timeout';

/**
 * The device answered and the answer was a refusal — either a JSON-RPC `error` envelope or a
 * non-zero per-property `code` in the result. {@link MiotError.code} carries which.
 */
export const MIOT_ERROR_DEVICE_ERROR = 'device_error';

/**
 * The packet exchange itself failed: a socket error, a failed `send`, an empty response, or a
 * payload that would not decrypt or parse.
 *
 * Folded into one member on purpose. The distinction that earns its keep is *the device refused*
 * vs *the device was silent* vs *we never completed an exchange*; splitting the third into
 * socket-vs-malformed would add a metric dimension nobody would filter on, and both mean the same
 * thing to the operator — the fault is not in the spec entry.
 */
export const MIOT_ERROR_TRANSPORT_ERROR = 'transport_error';

/** The failure classes this package can produce. */
export type MiotErrorKind =
    | typeof MIOT_ERROR_TIMEOUT
    | typeof MIOT_ERROR_DEVICE_ERROR
    | typeof MIOT_ERROR_TRANSPORT_ERROR;

/**
 * The miIO wire method a call used.
 *
 * A bounded set of four, which is what makes it safe as a metric dimension. `handshake` is the
 * unencrypted hello exchange rather than a JSON-RPC method, and is included because a stamp
 * refresh fails there often enough that hiding it under the method that triggered it would be a
 * lie.
 */
export const MIOT_METHOD_HANDSHAKE = 'handshake';
export const MIOT_METHOD_GET_PROPERTIES = 'get_properties';
export const MIOT_METHOD_SET_PROPERTIES = 'set_properties';
export const MIOT_METHOD_ACTION = 'action';

export type MiotMethod =
    | typeof MIOT_METHOD_HANDSHAKE
    | typeof MIOT_METHOD_GET_PROPERTIES
    | typeof MIOT_METHOD_SET_PROPERTIES
    | typeof MIOT_METHOD_ACTION;

export interface MiotErrorOptions {
    readonly kind: MiotErrorKind;
    readonly method: MiotMethod;
    /** miIO status code, when the device supplied one. See {@link MiotError.code}. */
    readonly code?: number;
    /** The lower-level failure this one describes, kept for the stack trace. */
    readonly cause?: unknown;
    /** Whether the call had already been retried behind a fresh handshake when it failed. */
    readonly stampRefreshed?: boolean;
}

/** A miot call that failed, carrying why rather than only that it did. */
export class MiotError extends Error {
    /** Failure class. Bounded — it becomes an `error.type` attribute in the app. */
    public readonly kind: MiotErrorKind;

    /** The miIO wire method that failed. */
    public readonly method: MiotMethod;

    /**
     * The miIO status code, when the device supplied one. Absent for a timeout or a socket fault,
     * because there was no response to read one from.
     *
     * **Two wire positions produce it**, and miIO does not distinguish them as sharply as JSON-RPC
     * does:
     *
     * - `error.code` of the response envelope — the request as a whole was refused.
     * - the `code` field of a result item — the envelope was fine and *this property* was refused,
     *   which is the `-4004`-shaped answer that says "not implemented on this device".
     *
     * Both are recorded here because both are the device answering "no, and here is why", and both
     * belong in `rpc.response.status_code` under the escape hatch semconv provides for exactly
     * this: *"Semantic conventions for individual RPC frameworks SHOULD document what
     * `rpc.response.status_code` means in the context of that system"*.
     */
    public readonly code: number | undefined;

    /**
     * Whether this failure happened *after* the stamp was refreshed and the call retried.
     *
     * `MiotDevice.runWithStamp` retries every failure behind a fresh handshake, including a
     * `device_error` that will never succeed on a second attempt. That makes a refused property
     * cost two round trips plus a handshake, and it is invisible from the call site without this
     * flag.
     */
    public readonly stampRefreshed: boolean;

    constructor(message: string, options: MiotErrorOptions) {
        super(message, options.cause === undefined ? undefined : { cause: options.cause });
        this.name = 'MiotError';
        this.kind = options.kind;
        this.method = options.method;
        this.code = options.code;
        this.stampRefreshed = options.stampRefreshed ?? false;
    }

    /**
     * Narrows an unknown caught value.
     *
     * Checks the shape rather than the prototype: `instanceof` across two copies of this package
     * in a pnpm workspace is a well-known way to lose a type guard silently, and the whole point
     * of this class is that the classification survives the trip to the caller.
     */
    public static is(value: unknown): value is MiotError {
        return value instanceof Error && (value as Partial<MiotError>).kind !== undefined
            && (value as Partial<MiotError>).method !== undefined;
    }

    /**
     * Re-stamps an error as having survived a stamp refresh, preserving its classification.
     *
     * A non-`MiotError` becomes a `transport_error` for `method`, so the caller's classification is
     * total: something outside the transport threw and there is nothing device-specific to say.
     */
    public static afterStampRefresh(value: unknown, method: MiotMethod, deviceId: number): MiotError {
        const reason = value instanceof Error ? value.message : String(value);
        const message = `Operation failed after stamp refresh for device ${deviceId}: ${reason}`;

        if (MiotError.is(value)) {
            return new MiotError(message, {
                kind: value.kind,
                method: value.method,
                code: value.code,
                cause: value,
                stampRefreshed: true
            });
        }

        return new MiotError(message, { kind: MIOT_ERROR_TRANSPORT_ERROR, method, cause: value, stampRefreshed: true });
    }
}
