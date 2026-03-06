/**
 * DI token for versioned MQTT command handlers.
 *
 * Register a handler with `@Injectable({ type: MQTTHandlerToken })`.
 * Inject all handlers with `@Inject(MQTTHandlerToken) handlers: IMqttVersionHandler[]`.
 */
export const MQTTHandlerToken: unique symbol = Symbol('MQTTHandlerToken');
