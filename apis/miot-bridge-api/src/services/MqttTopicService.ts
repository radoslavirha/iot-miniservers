import { Service, Scope, ProviderScope } from '@tsed/di';
import { ConfigService } from './ConfigService.js';
import { CommonUtils } from '@radoslavirha/utils';

/**
 * Centralises MQTT topic construction.
 *
 * All topics are per-device following a REST-like structure:
 *  - `command`       — inbound device commands:  `[prefix/]miot-bridge/device/{id}/command`
 *  - `response`      — outbound command responses: `[prefix/]miot-bridge/device/{id}/response`
 *  - `notifications` — outbound property changes:  `[prefix/]miot-bridge/device/{id}/notifications`
 *
 * The optional `mqtt.topicPrefix` config value is prepended to every topic.
 * Trailing slashes in the prefix are stripped automatically.
 *
 * Each topic also has a `…Template` variant with `{deviceId}` left unsubstituted. Those are
 * for telemetry: every topic here embeds a device id, so naming spans after the concrete topic
 * would give Tempo one span name per device and break grouping and every latency aggregate.
 * The concrete topic still travels on the span as `messaging.destination.name`.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class MqttTopicService {
    /** Placeholder standing in for the device id in the `…Template` variants. */
    private static readonly DEVICE_ID_PLACEHOLDER = '{deviceId}';

    constructor(private readonly configService: ConfigService) {}

    /**
     * Returns the MQTT wildcard subscription pattern for inbound device commands.
     * Format: `[prefix/]miot-bridge/device/+/command`
     */
    public getCommandSubscriptionPattern(): string {
        return this.build('miot-bridge/device/+/command');
    }

    /**
     * Returns the inbound command topic for a specific device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/command`
     */
    public getCommandTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/command`);
    }

    /**
     * Low-cardinality form of {@link getCommandTopic} for span names.
     * Format: `[prefix/]miot-bridge/device/{deviceId}/command`
     */
    public getCommandTopicTemplate(): string {
        return this.build(`miot-bridge/device/${MqttTopicService.DEVICE_ID_PLACEHOLDER}/command`);
    }

    /**
     * Returns the outbound response topic for a specific device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/response`
     */
    public getResponseTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/response`);
    }

    /**
     * Low-cardinality form of {@link getResponseTopic} for span names.
     * Format: `[prefix/]miot-bridge/device/{deviceId}/response`
     */
    public getResponseTopicTemplate(): string {
        return this.build(`miot-bridge/device/${MqttTopicService.DEVICE_ID_PLACEHOLDER}/response`);
    }

    /**
     * Returns the notification topic for a specific Xiaomi device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/notifications`
     */
    public getNotificationsTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/notifications`);
    }

    /**
     * Low-cardinality form of {@link getNotificationsTopic} for span names.
     * Format: `[prefix/]miot-bridge/device/{deviceId}/notifications`
     */
    public getNotificationsTopicTemplate(): string {
        return this.build(`miot-bridge/device/${MqttTopicService.DEVICE_ID_PLACEHOLDER}/notifications`);
    }

    /**
     * Extracts the numeric device ID from a device command topic.
     * Returns `null` if the topic does not match the expected pattern.
     */
    public extractDeviceIdFromCommandTopic(topic: string): number | null {
        const prefix = this.getPrefix();
        const before = prefix ? `${prefix}/miot-bridge/device/` : 'miot-bridge/device/';
        const after = '/command';
        if (!topic.startsWith(before) || !topic.endsWith(after)) {
            return null;
        }
        const idStr = topic.slice(before.length, topic.length - after.length);
        const id = parseInt(idStr);
        return isNaN(id) ? null : id;
    }

    private getPrefix(): string {
        const raw = this.configService.config.mqtt?.topicPrefix;
        const prefix = raw?.replace(/\/+$/, '');
        return CommonUtils.notNil(prefix) ? prefix : '';
    }

    /**
     * Tests emptiness, not nil-ness: `getPrefix()` normalises "no prefix" to `''`, which is
     * not nil, so an `isNil` check here produced a leading slash on every topic when no prefix
     * was configured. `extractDeviceIdFromCommandTopic` has always compared against the
     * unslashed form, so the two disagreed and every inbound command was silently dropped.
     * Latent in production only because every deployment sets `mqtt.topicPrefix`.
     */
    private build(path: string): string {
        const prefix = this.getPrefix();
        return prefix === '' ? path : `${prefix}/${path}`;
    }
}
