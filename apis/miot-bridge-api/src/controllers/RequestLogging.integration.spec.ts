import { describe, beforeEach, afterEach, expect, it, vi } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import SuperTest from 'supertest';
import { Logger } from '@radoslavirha/tsed-logger';
import { Server } from '../Server.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';

/**
 * What a refused request writes to the log.
 *
 * Not a controller test — the request logger runs for every route — but it only
 * became load-bearing when authentication started producing refusals in volume.
 *
 * The defect this guards against lived *between* the code and the log: the
 * request logger was called correctly and wrote a secret anyway, because
 * `requests.headers.redactPaths` defaults to `[]` and nothing in this service
 * had overridden it. Only the emitted `headers` value proves the override is
 * still in place; the call itself always looked right.
 */
describe('Request logging (integration)', () => {
    let request: SuperTest.Agent;

    beforeEach(PlatformTest.bootstrap(Server, {
        imports: [{ token: MqttClientProvider, use: null }]
    }));
    beforeEach(() => {
        request = SuperTest.agent(PlatformTest.callback());
    });
    afterEach(PlatformTest.reset);

    it('redacts the credential it just rejected', async () => {
        // A rejected token is often still a live token — minted for another
        // audience, or expired by seconds. These records ship to Loki, so
        // logging one verbatim hands it to anyone who can read the logs.
        const secret = 'a-token-that-must-never-reach-the-log';
        // `httpLog` is the private child the request logger writes through.
        // Cast through `unknown`: a private member cannot be widened by an
        // intersection, and this test exists precisely to see what it receives.
        const logger = PlatformTest.get<Logger>(Logger) as unknown as {
            httpLog: { error: (message: string, meta: unknown) => void };
        };
        const emitted = vi.spyOn(logger.httpLog, 'error').mockImplementation(() => undefined);

        await request.get('/devices').set('Authorization', `Bearer ${secret}`).expect(401);

        expect(emitted).toHaveBeenCalledOnce();
        const [, meta] = emitted.mock.calls[0] as [string, { headers: string }];
        expect(meta.headers).toContain('"authorization":"***"');
        expect(JSON.stringify(meta)).not.toContain(secret);
    });

    it('redacts a cookie and an api key alongside it', async () => {
        // Same fail-open default, same blast radius: a session cookie is a
        // credential, and `x-api-key` is what a device would present once one
        // exists.
        const logger = PlatformTest.get<Logger>(Logger) as unknown as {
            httpLog: { error: (message: string, meta: unknown) => void };
        };
        const emitted = vi.spyOn(logger.httpLog, 'error').mockImplementation(() => undefined);

        await request
            .get('/devices')
            .set('Cookie', 'session=cookie-must-not-reach-the-log')
            .set('X-Api-Key', 'key-must-not-reach-the-log')
            .expect(401);

        const [, meta] = emitted.mock.calls[0] as [string, { headers: string }];
        expect(JSON.stringify(meta)).not.toContain('must-not-reach-the-log');
    });

    it('keeps the fields that make a log entry useful', async () => {
        // Redaction that swallowed the whole header block would pass the two
        // tests above and leave nobody able to debug a 401.
        const logger = PlatformTest.get<Logger>(Logger) as unknown as {
            httpLog: { error: (message: string, meta: unknown) => void };
        };
        const emitted = vi.spyOn(logger.httpLog, 'error').mockImplementation(() => undefined);

        await request.get('/devices').set('User-Agent', 'integration-test').expect(401);

        const [, meta] = emitted.mock.calls[0] as [string, { headers: string; status: number; url: string }];
        expect(meta.headers).toContain('integration-test');
        expect(meta.status).toBe(401);
        expect(meta.url).toBe('/devices');
    });
});
