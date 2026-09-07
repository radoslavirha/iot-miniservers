import { mintTestToken, type MintTestTokenOptions } from '@radoslavirha/auth';

/**
 * An agent that can carry default headers on every request it makes.
 *
 * Structural rather than a `supertest` import, so this package does not take a
 * dependency on a test library to hand one a convenience. **It must be built
 * with `SuperTest.agent(app)`, not `SuperTest(app)`** — only the former is a
 * persistent agent with `set`; the latter builds a fresh request per verb and
 * silently has no such method.
 */
export interface AuthenticatableAgent {
    set(field: string, value: string): unknown;
}

/**
 * Points a test agent's every request at a freshly minted, valid bearer JWT.
 *
 * ```ts
 * let request: SuperTest.Agent;   // anonymous
 * let api: SuperTest.Agent;       // authenticated
 *
 * beforeEach(async () => {
 *     request = SuperTest.agent(PlatformTest.callback());
 *     api = await authenticateBearerJwt(SuperTest.agent(PlatformTest.callback()));
 * });
 *
 * await api.get('/qr-codes').expect(200);
 * await request.get('/qr-codes').expect(401);
 * ```
 *
 * **Named for the mechanism, not for authentication in general.** A second
 * mechanism gets its own function beside this one — `authenticateApiKey`, say —
 * rather than widening this one with a discriminator. The mechanisms differ in
 * what they mint *and* where it goes: a bearer JWT is an `Authorization` header,
 * an API key may be a different header entirely, and a name like `authenticate`
 * would have to lie about one of them.
 *
 * The token comes from `mintTestToken`'s defaults, which are deliberately the
 * same issuer, audience and secret a service's `config/test.json` inline-key row
 * uses — so a suite that copies that row needs no arguments here, and the two
 * cannot drift apart. Pass options to vary the caller:
 * `authenticateBearerJwt(agent, { subject: 'someone' })`.
 *
 * **It mutates and returns the agent it is given**, because that is what
 * `agent.set` does — superagent's persistent agent is the supported way to carry
 * a default header, and wrapping it to pretend otherwise would be this package
 * reimplementing a test library. Hand it its own agent when the suite also needs
 * an anonymous one; two agents against the same callback is the cheap, obvious
 * arrangement, and which is which stays visible at the call site.
 *
 * For a token you already hold — a real one captured from a browser, or a
 * deliberately broken one — there is no helper and none is needed:
 * `agent.set('Authorization', `Bearer ${token}`)`.
 */
export const authenticateBearerJwt = async <T extends AuthenticatableAgent>(
    agent: T,
    options: MintTestTokenOptions = {}
): Promise<T> => {
    agent.set('Authorization', `Bearer ${await mintTestToken(options)}`);
    return agent;
};
