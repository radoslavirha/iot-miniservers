import { Injectable, ProviderScope, Scope } from '@tsed/di';

/**
 * Tracks whether the process has begun shutting down.
 *
 * `/health/ready` returns 503 as soon as this flips, **before** consulting any check, so
 * kubelet stops routing new work to a pod that is on its way out. `/health/live` is
 * deliberately unaffected: a draining pod is not a stuck pod, and failing liveness during
 * shutdown earns a pointless restart on the way to the grave.
 *
 * Ts.ED has no pre-shutdown lifecycle hook — `platform.stop()` is
 * `destroyInjector()` (which emits `$onDestroy`) followed by closing the listeners, so by
 * the time `$onDestroy` fires, mongoose and MQTT are being torn down alongside it. The
 * drain must therefore be triggered from the signal handler, before `platform.stop()`.
 * Use {@link createShutdownHandler}, which sequences that correctly.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ShutdownState {
    private _draining = false;

    /** Whether the process has begun draining. */
    public get draining(): boolean {
        return this._draining;
    }

    /** Marks the process as draining. Idempotent, and there is no way back. */
    public beginDrain(): void {
        this._draining = true;
    }
}
