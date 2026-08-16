import { Service, Scope, ProviderScope } from '@tsed/di';
import type { Span } from '@opentelemetry/api';
import {
    withMqttConsumeSpan,
    withMqttPublishSpan,
    type MqttSpanOptions,
    type MqttUserProperties
} from '@radoslavirha/otel';
import { ConfigService } from './ConfigService.js';

/** Span options a call site supplies; broker identity is filled in from config. */
type CallSiteOptions = Omit<MqttSpanOptions, 'clientId' | 'brokerUrl'>;

/**
 * Wraps the MQTT span helpers from `@radoslavirha/otel` with this app's broker identity.
 *
 * Sibling of {@link MqttTopicService}: that one owns the topic strings, this one owns the
 * spans. Both exist so the three MQTT call sites — inbound command, command response, outbound
 * notification — cannot drift apart in what they report. Filling `clientId` and `brokerUrl`
 * here rather than at each call site is the whole point; a publish span missing
 * `server.address` is invisible to a Tempo query that filters on it.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class MqttTracingService {
    constructor(private readonly configService: ConfigService) {}

    /**
     * Runs `fn` inside a CONSUMER span for an inbound message, continuing the sender's trace
     * when the packet carried one.
     *
     * Wrap the *entire* handling of the message, response publish included: the span is what
     * makes the HTTP and Mongo spans raised further down — by auto-instrumentations that know
     * nothing about MQTT — children of the message that caused them.
     */
    public consume<T>(options: CallSiteOptions & { userProperties?: MqttUserProperties }, fn: (span: Span) => T): T {
        return withMqttConsumeSpan({ ...options, ...this.broker() }, fn);
    }

    /**
     * Runs `fn` inside a PRODUCER span, handing it the MQTT 5 user properties to attach to the
     * outgoing packet so a consumer downstream continues this trace.
     */
    public publish<T>(options: CallSiteOptions, fn: (userProperties: Record<string, string>, span: Span) => T): T {
        return withMqttPublishSpan({ ...options, ...this.broker() }, fn);
    }

    /**
     * Broker identity for `messaging.client.id` / `server.address` / `server.port`.
     *
     * `url` is safe to expose as a span attribute: `MqttClientProvider` passes username and
     * password as separate connect options, so credentials are never part of it.
     */
    private broker(): Pick<MqttSpanOptions, 'clientId' | 'brokerUrl'> {
        const mqtt = this.configService.config.mqtt;

        return { clientId: mqtt?.clientId, brokerUrl: mqtt?.url };
    }
}
