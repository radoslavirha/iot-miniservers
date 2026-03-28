import { Service, Scope, ProviderScope } from '@tsed/di';
import { ConfigService } from './ConfigService.js';
import { CommonUtils } from '@radoslavirha/utils';

export type MqttTopics = {
    readonly command: string;
    readonly response: string;
};

/**
 * Centralises MQTT topic construction.
 *
 * Returns the two base topics used by the miot-bridge protocol:
 *  - `command`  — inbound device commands
 *  - `response` — outbound command responses
 *
 * Notification topics are per-device and built via {@link getNotificationsTopic}.
 *
 * The optional `mqtt.topicPrefix` config value is prepended to every topic.
 * Trailing slashes in the prefix are stripped automatically.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class MqttTopicService {
    constructor(private readonly configService: ConfigService) {}

    public get(): MqttTopics {
        return {
            command: this.build('miot-bridge/command'),
            response: this.build('miot-bridge/response')
        };
    }

    /**
     * Returns the notification topic for a specific Xiaomi device.
     * Format: `[prefix/]miot-bridge/device/{miotDeviceId}/notifications`
     */
    public getNotificationsTopic(miotDeviceId: number): string {
        return this.build(`miot-bridge/device/${miotDeviceId}/notifications`);
    }

    private build(path: string): string {
        const raw = this.configService.config.mqtt?.topicPrefix;
        const prefix = raw?.replace(/\/+$/, '');
        return CommonUtils.notNil(prefix) ? `${prefix}/${path}` : path;
    }
}
