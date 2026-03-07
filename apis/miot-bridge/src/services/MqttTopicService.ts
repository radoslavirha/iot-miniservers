import { Service, Scope, ProviderScope } from '@tsed/di';
import { ConfigService } from './ConfigService.js';

export type MqttTopics = {
    readonly command: string;
    readonly response: string;
    readonly notifications: string;
};

/**
 * Centralises MQTT topic construction.
 *
 * Returns the three topics used by the miot-bridge protocol:
 *  - `command`       — inbound device commands
 *  - `response`      — outbound command responses
 *  - `notifications` — outbound property-change events
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
            response: this.build('miot-bridge/response'),
            notifications: this.build('miot-bridge/notifications')
        };
    }

    private build(path: string): string {
        const raw = this.configService.config.mqtt?.topicPrefix;
        const prefix = raw?.replace(/\/+$/, '');
        return prefix ? `${prefix}/${path}` : path;
    }
}
