import { readFile } from 'node:fs/promises';
import { prettifyError } from 'zod';
import type { ZodType } from 'zod';

/**
 * Outcome of validating a config file. A discriminated result rather than a
 * throw, so the CLI owns all process/console concerns and this stays testable.
 */
export type ValidateConfigFileResult =
    | { readonly ok: true }
    | { readonly ok: false; readonly reason: 'unreadable' | 'not-json' | 'invalid'; readonly message: string };

/**
 * Validates a JSON file against a schema. Node-side half of the shared
 * validator — this is what runs in the validating initContainer at pod start.
 *
 * The returned `message` never contains config *values*: it is either a file
 * path, a JSON parser message, or Zod's own output, which reports types and
 * paths only. That matters because homelab-dashboard-ui's config carries
 * `unifi.apiKey`, and this message goes to pod logs and on to Loki.
 */
export const validateConfigFile = async <T>(
    schema: ZodType<T>,
    path: string
): Promise<ValidateConfigFileResult> => {
    let contents: string;
    try {
        contents = await readFile(path, 'utf8');
    } catch {
        return {
            ok: false,
            reason: 'unreadable',
            message: `${path} could not be read. The chart mounts it from templates.<name>.`
        };
    }

    let raw: unknown;
    try {
        raw = JSON.parse(contents);
    } catch {
        return { ok: false, reason: 'not-json', message: `${path} is not valid JSON.` };
    }

    const result = schema.safeParse(raw);
    if (!result.success) {
        return { ok: false, reason: 'invalid', message: prettifyError(result.error) };
    }

    return { ok: true };
};
