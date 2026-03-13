import { createSocket } from 'dgram';
import { Inject, Service, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import type { MqttClient } from 'mqtt';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { NotificationPayload } from '../models/NotificationPayload.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { ConfigService } from './ConfigService.js';
import { MqttTopicService } from './MqttTopicService.js';

/**
 * Central hub for all inbound property-value observations, regardless of transport.
 *
 * Sources:
 * - {@link DevicePropertyPollerService} — periodic polls (`PROPERTY_CHANGED` events)
 * - {@link DeviceCommandService} — direct GET_PROPERTY calls via HTTP / UDP / MQTT
 *
 * Outbound transports: HTTP POST and UDP datagram.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class NotificationDispatchService {
    constructor(
        private readonly configService: ConfigService,
        @Inject(MqttClientProvider) private readonly mqttClient: MqttClient | null,
        private readonly mqttTopicService: MqttTopicService
    ) {}

    /**
     * Receives a property-value observation and forwards it to all enabled
     * outbound notification transports (HTTP, UDP).
     */
    public receive(event: PropertyChangeEvent): void {
        const payload = CommonUtils.buildModelStrict(NotificationPayload, {
            deviceId: event.miotDeviceId,
            property: event.property,
            value: event.newValue
        });

        const config = this.configService.config;

        if (ObjectUtils.isEnabled(config.http?.notifications)) {
            void this.sendHttp(config.http.notifications.address, payload);
        }

        if (ObjectUtils.isEnabled(config.udp?.notifications)) {
            void this.sendUdp(config.udp.notifications.address, payload);
        }

        if (ObjectUtils.isEnabled(config.mqtt?.notifications) && this.mqttClient) {
            this.sendMqtt(payload);
        }
    }

    private sendMqtt(payload: NotificationPayload): void {
        const topic = this.mqttTopicService.getNotificationsTopic(payload.deviceId);
        const message = `${payload.property}=${String(payload.value ?? '')}`;
        this.mqttClient!.publish(topic, message, { qos: 1 }, (err) => {
            if (CommonUtils.notNil(err)) {
                $log.warn({
                    event: 'NOTIFICATION_MQTT_ERROR',
                    topic,
                    deviceId: payload.deviceId,
                    property: payload.property,
                    message: err.message
                });
            } else {
                $log.debug({
                    event: 'NOTIFICATION_MQTT_SENT',
                    topic,
                    deviceId: payload.deviceId,
                    property: payload.property
                });
            }
        });
    }

    private async sendHttp(address: string, payload: NotificationPayload): Promise<void> {
        try {
            const response = await fetch(address, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            $log.debug({
                event: 'NOTIFICATION_HTTP_SENT',
                address,
                deviceId: payload.deviceId,
                property: payload.property,
                status: response.status
            });
        } catch (error) {
            $log.warn({
                event: 'NOTIFICATION_HTTP_ERROR',
                address,
                deviceId: payload.deviceId,
                property: payload.property,
                message: error instanceof Error ? error.message : String(error)
            });
        }
    }

    private sendUdp(address: string, payload: NotificationPayload): Promise<void> {
        return new Promise(resolve => {
            const colonIndex = address.lastIndexOf(':');
            if (colonIndex === -1) {
                $log.warn({ event: 'NOTIFICATION_UDP_ERROR', address, message: 'Invalid UDP address format. Expected host:port.' });
                return resolve();
            }
            const host = address.slice(0, colonIndex);
            const port = parseInt(address.slice(colonIndex + 1), 10);
            if (CommonUtils.isNil(host) || isNaN(port)) {
                $log.warn({ event: 'NOTIFICATION_UDP_ERROR', address, message: 'Invalid UDP address format. Expected host:port.' });
                return resolve();
            }

            const socket = createSocket('udp4');
            const message = `deviceId=${payload.deviceId}\n${payload.property}=${String(payload.value ?? '')}`;
            const buffer = Buffer.from(message, 'utf8');
            socket.send(buffer, port, host, (error) => {
                socket.close();
                if (CommonUtils.notNil(error)) {
                    $log.warn({
                        event: 'NOTIFICATION_UDP_ERROR',
                        address,
                        deviceId: payload.deviceId,
                        property: payload.property,
                        message: error.message
                    });
                } else {
                    $log.debug({
                        event: 'NOTIFICATION_UDP_SENT',
                        address,
                        deviceId: payload.deviceId,
                        property: payload.property
                    });
                }
                resolve();
            });
        });
    }
}
