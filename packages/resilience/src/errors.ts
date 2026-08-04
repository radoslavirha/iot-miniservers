/**
 * Re-exported failure types so consumers can detect resilience outcomes without
 * importing cockatiel directly.
 *
 * - {@link BrokenCircuitError} / {@link isBrokenCircuitError} — thrown/true when
 *   the circuit is open and the call is short-circuited.
 * - {@link TaskCancelledError} / {@link isTaskCancelledError} — thrown/true when
 *   a timeout (or an aborted parent signal) cancels the operation.
 */
export {
    BrokenCircuitError,
    TaskCancelledError,
    isBrokenCircuitError,
    isTaskCancelledError
} from 'cockatiel';
