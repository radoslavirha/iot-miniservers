import { Inject, Injectable, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import { MQTTHandlerToken } from '../tokens/MQTTHandlerToken.js';
import type { IMqttVersionHandler } from './IMqttVersionHandler.js';

export type MqttTopicPair = { readonly command: string; readonly response: string };

/** Topic on which device property change notifications are published. */
export const MQTT_NOTIFICATION_TOPIC = 'miot-bridge/v1/notifications';
/**
 * Routes incoming MQTT command messages to the correct versioned handler.
 * All handlers registered with @Injectable({ type: MQTTHandlerToken }) are injected automatically.
 *
 * Exact subscription topics are derived from each handler's {@link IMqttVersionHandler.version}
 * property so no wildcard subscriptions or topic regex parsing are needed.
 *
 * Topic convention:
 *   - Inbound:  `miot-bridge/{version}/command`
 *   - Outbound: `miot-bridge/{version}/response`
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class MqttCommandRouter {
    private readonly commandMap: Map<string, IMqttVersionHandler>;
    private readonly topicPairs: MqttTopicPair[];

    constructor(@Inject(MQTTHandlerToken) handlers: IMqttVersionHandler[]) {
        this.topicPairs = handlers.map(h => ({
            command: `miot-bridge/${h.version as string}/command`,
            response: `miot-bridge/${h.version as string}/response`
        }));
        this.commandMap = new Map(handlers.map((h, i) => [this.topicPairs[i].command, h]));
    }

    /** Returns command/response topic pairs, one per registered handler. */
    public topics(): MqttTopicPair[] {
        return this.topicPairs;
    }

    async route(payload: Buffer, commandTopic: string): Promise<string> {
        const handler = this.commandMap.get(commandTopic);

        if (!handler) {
            $log.warn({ event: 'MQTT_UNSUPPORTED_TOPIC', message: `No handler registered for topic: ${commandTopic}.` });
            return JSON.stringify({ success: false, error: `No handler registered for topic: ${commandTopic}` });
        }

        return handler.handle(payload);
    }
}
