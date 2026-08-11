// Importing this barrel is what registers the checks — the @Injectable({ type:
// HEALTH_CHECKS }) decorator runs on module load. Server.ts imports it for that side
// effect, exactly as it does with ./providers/index.js.
export * from './UpstreamHealthCheck.js';
