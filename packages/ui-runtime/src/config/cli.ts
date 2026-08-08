import type { ZodType } from 'zod';
import { validateConfigFile } from './validateConfigFile.js';

/**
 * Entry point for an app's config validator, run by the validating
 * initContainer the `iot-applications` chart generates.
 *
 * The config path comes from argv, never a hardcoded filename: the chart passes
 * `/config/<templates.<name>.file>`, and that `file` key is configurable per app.
 *
 * Exits 1 on any failure, which fails the initContainer, which stops the pod
 * from ever reaching the main container.
 */
export const runConfigValidatorCli = async <T>(
    schema: ZodType<T>,
    path: string | undefined,
    label = 'config-validator'
): Promise<never> => {
    if (path === undefined || path === '') {
        process.stderr.write(`[${label}] FATAL: no config path given. Usage: <validator> <path-to-config.json>\n`);
        return process.exit(1);
    }

    const result = await validateConfigFile(schema, path);

    if (!result.ok) {
        process.stderr.write(`[${label}] FATAL: ${result.message}\n`);
        process.exit(1);
    }

    process.stdout.write(`[${label}] ${path} is valid\n`);
    process.exit(0);
};
