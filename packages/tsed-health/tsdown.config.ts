import { cjsConfig, esmConfig } from '@radoslavirha/config-tsdown';
import { defineConfig } from 'tsdown';

/**
 * Two entries, not one. `mongoose` is an **optional** peer dependency, so the Mongo check
 * must be reachable only through the `/mongoose` subpath — bundling it into the main entry
 * would make every consumer resolve `@tsed/mongoose` at import time, including the apps
 * that have no database.
 */
const entry = ['src/index.ts', 'src/mongoose.ts'];

export default defineConfig([
    { ...cjsConfig, entry },
    { ...esmConfig, entry }
]);
