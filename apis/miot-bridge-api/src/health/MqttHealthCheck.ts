import { HEALTH_CHECKS, type HealthCheck, type HealthCheckResult } from '@radoslavirha/tsed-health';
import { CommonUtils } from '@radoslavirha/utils';
import { Inject, Injectable, ProviderScope, Scope } from '@tsed/di';
import type { MqttClient } from 'mqtt';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { HealthStatus } from '@radoslavirha/tsed-health';

/**
 * Reports the MQTT broker connection state.
 *
 * `critical: true` — this app bridges MQTT to HTTP, so a disconnected broker means every
 * inbound command is dropped and every outbound notification is lost. Failing readiness
 * removes the pod from Endpoints; nothing restarts, because liveness never consults this.
 *
 * **This check is the only signal a mid-life broker outage produces.**
 * `MqttClientProvider` rejects the bootstrap promise only during startup, after
 * `MAX_STARTUP_ERRORS` consecutive failures — so a broker that is down at boot is already
 * a CrashLoop. Reconnects *after* startup are silent: the client logs and retries forever
 * while the process stays healthy-looking. That is precisely the case readiness is for.
 */
@Injectable({ type: HEALTH_CHECKS })
@Scope(ProviderScope.SINGLETON)
export class MqttHealthCheck implements HealthCheck {
    public readonly name = 'mqtt';
    public readonly critical = true;

    @Inject(MqttClientProvider)
    private readonly client!: MqttClient | null;

    public check(): HealthCheckResult {
        // The provider resolves to null when `mqtt.enabled` is false. A feature switched
        // off is not a failure — reporting `fail` here would keep a valid HTTP-only
        // deployment permanently out of Endpoints.
        if (CommonUtils.isNil(this.client)) {
            return { status: HealthStatus.Pass, detail: 'disabled' };
        }

        return this.client.connected
            ? { status: HealthStatus.Pass }
            : { status: HealthStatus.Fail, detail: 'disconnected' };
    }
}
