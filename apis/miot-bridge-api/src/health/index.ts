// Importing this barrel is what registers the checks — the @Injectable({ type:
// HEALTH_CHECKS }) decorators run on module load. Server.ts imports it for that side
// effect, as it does with ./providers.
//
// MongoHealthCheck is shared, from the /mongoose subpath: `mongoose` and `@tsed/mongoose`
// are optional peers of @radoslavirha/tsed-health, so an app with no database never
// resolves them. Re-exporting here is what pulls it into this app's DI container.
export { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
export * from './MqttHealthCheck.js';
