import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { validateConfigFile } from './validateConfigFile.js';
import { absolutePath, httpUrl } from './schema-helpers.js';

/** Planted in fixtures to prove no config value ever reaches the message. */
const SENTINEL = 'sup3r-s3cret-sentinel';

const schema = z.object({
    apiBaseURL: httpUrl(),
    basePath: absolutePath().default('/'),
    unifi: z.object({ apiKey: z.string().min(1) }).optional()
});

let dir: string;

const fixture = async (name: string, contents: string): Promise<string> => {
    const path = join(dir, name);
    await writeFile(path, contents, 'utf8');
    return path;
};

beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ui-runtime-'));
});

afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
});

describe('validateConfigFile', () => {
    it('accepts a valid config', async () => {
        const path = await fixture('valid.json', JSON.stringify({ apiBaseURL: 'https://api.test' }));

        await expect(validateConfigFile(schema, path)).resolves.toEqual({ ok: true });
    });

    it('reports unreadable when the file is missing', async () => {
        const result = await validateConfigFile(schema, join(dir, 'nope.json'));

        expect(result).toMatchObject({ ok: false, reason: 'unreadable' });
    });

    it('reports not-json for a truncated file', async () => {
        const path = await fixture('bad.json', '{ "apiBaseURL": ');

        expect(await validateConfigFile(schema, path)).toMatchObject({ ok: false, reason: 'not-json' });
    });

    it('reports invalid when a required key is absent', async () => {
        const path = await fixture('missing.json', JSON.stringify({ basePath: '/x' }));

        const result = await validateConfigFile(schema, path);

        expect(result).toMatchObject({ ok: false, reason: 'invalid' });
        expect(result.ok ? '' : result.message).toContain('apiBaseURL');
    });

    it('reports invalid when a required key is empty — the empty-substitution case', async () => {
        const path = await fixture('empty.json', JSON.stringify({ apiBaseURL: '' }));

        expect(await validateConfigFile(schema, path)).toMatchObject({ ok: false, reason: 'invalid' });
    });

    it('reports invalid for a URL with no scheme', async () => {
        const path = await fixture('scheme.json', JSON.stringify({ apiBaseURL: 'localhost:4002' }));

        expect(await validateConfigFile(schema, path)).toMatchObject({ ok: false, reason: 'invalid' });
    });

    it('never puts a config value in the message', async () => {
        const path = await fixture('secret.json', JSON.stringify({
            apiBaseURL: SENTINEL,
            basePath: SENTINEL,
            unifi: { apiKey: '' }
        }));

        const result = await validateConfigFile(schema, path);

        expect(result.ok).toBe(false);
        expect(result.ok ? '' : result.message).not.toContain(SENTINEL);
    });
});
