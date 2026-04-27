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
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class MqttTopicService {
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
     * Returns the outbound response topic for a specific device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/response`
     */
    public getResponseTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/response`);
    }

    /**
     * Returns the notification topic for a specific Xiaomi device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/notifications`
     */
    public getNotificationsTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/notifications`);
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

    private build(path: string): string {
        const prefix = this.getPrefix();
        return CommonUtils.isNil(prefix) ? path : `${prefix}/${path}`;
    }
}
