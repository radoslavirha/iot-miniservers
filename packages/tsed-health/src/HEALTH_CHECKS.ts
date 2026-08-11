/**
 * The provider **type** that health checks are grouped under.
 *
 * This is a provider type, *not* an injection token — the distinction matters and the
 * `@tsed/di` naming invites getting it wrong. `injectMany(x)` calls `getMany(x)`, which
 * resolves `getProviders(x)`, and that matches on `String(provider.type)`. Each check
 * therefore keeps its own token (its class) and is grouped by this symbol:
 *
 * ```ts
 * @Injectable({ type: HEALTH_CHECKS })
 * @Scope(ProviderScope.SINGLETON)
 * export class MongoHealthCheck implements HealthCheck { ... }
 * ```
 *
 * **A check registered with a bare `@Injectable()` is silently invisible here.** It
 * resolves and injects normally, and never appears in `injectMany` — so the app reports
 * healthy having checked nothing. Assert the expected set of check names in the app's
 * integration test; asserting a 200 from `/health` does not catch it.
 *
 * The description is namespaced because only the stringified form is compared, so a bare
 * `'HEALTH_CHECKS'` would collide with any unrelated symbol of the same description.
 */
export const HEALTH_CHECKS = Symbol.for('radoslavirha:HEALTH_CHECKS');
