/**
 * Entry point for the homelab-dashboard-ui-config-validator image.
 *
 * Bundled by esbuild (`pnpm run build:validator`) into a standalone script with
 * zod inlined, then run as an initContainer by the iot-applications chart:
 *
 *     node /app/validate-config.js /config/config.json
 *
 * The path comes from argv because templates.<name>.file is configurable per
 * app — never hardcode a filename here.
 */
import { runConfigValidatorCli } from '@radoslavirha/ui-runtime/validator';
import { AppConfigSchema } from './RuntimeConfig.js';

await runConfigValidatorCli(AppConfigSchema, process.argv[2], 'homelab-dashboard-ui');
