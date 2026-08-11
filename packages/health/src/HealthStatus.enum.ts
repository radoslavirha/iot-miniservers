/**
 * Health status, following the `application/health+json` vocabulary of
 * `draft-inadarei-api-health-check`.
 *
 * - {@link HealthStatus.Pass} — healthy.
 * - {@link HealthStatus.Warn} — degraded but serving. Never removes a pod from Endpoints.
 * - {@link HealthStatus.Fail} — unhealthy. Removes the pod from Endpoints **only** when the
 *   failing check is `critical`.
 *
 * Values are lowercase rather than the repository's usual `UPPER_SNAKE_CASE` because they
 * are an external wire format — the IETF draft specifies these exact strings, and they go
 * out in the `/health` body. This is the same exception AGENTS.md carves out for DTO enums.
 */
export enum HealthStatus {
    Pass = 'pass',
    Warn = 'warn',
    Fail = 'fail'
}
