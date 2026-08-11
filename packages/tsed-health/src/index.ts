export { HEALTH_CHECKS } from './HEALTH_CHECKS.js';
export { HealthCheckService } from './HealthCheckService.js';
export { HEALTH_CONTENT_TYPE, HealthController } from './HealthController.js';
export { ShutdownState } from './ShutdownState.js';
export { DEFAULT_DRAIN_DELAY_MS, createShutdownHandler } from './createShutdownHandler.js';
export type { ShutdownHandlerOptions, StoppablePlatform } from './createShutdownHandler.js';
// Re-exported so an app registering checks needs only this package — the core contract is
// an implementation detail of where the logic lives, not of how a check is written.
export { breakerCheck } from '@radoslavirha/health';
export { CircuitState, HealthStatus } from '@radoslavirha/health';
export type {
    CircuitStateLike,
    HealthCheck,
    HealthCheckResult,
    HealthConfig,
    HealthReport
} from '@radoslavirha/health';
export { HealthConfigSchema } from '@radoslavirha/health';
