import { CircuitState } from 'cockatiel';

/**
 * The state of a circuit breaker.
 *
 * Re-exported from cockatiel so consumers can read and compare breaker state without
 * importing cockatiel themselves — this package already owns that dependency, and a
 * consumer duplicating the enum by value would silently misreport if the numbering ever
 * changed.
 */
export { CircuitState };

/**
 * Read-only view of a circuit breaker.
 *
 * Anything that holds a breaker can expose it as this without surfacing the full
 * `CircuitBreakerPolicy` — the control surface (`isolate`, `execute`) stays private while
 * the state stays observable. Cockatiel's `CircuitBreakerPolicy` satisfies it directly.
 */
export interface CircuitStateLike {
    readonly state: CircuitState;
}
