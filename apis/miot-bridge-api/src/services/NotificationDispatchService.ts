import { createSocket } from 'dgram';
import { Inject, Service, Scope, ProviderScope } from '@tsed/di';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';
import { SpanStatusCode } from '@opentelemetry/api';
import type { MqttClient } from 'mqtt';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { NotificationPayload } from '../models/NotificationPayload.js';
import { MqttClientProvider } from '../providers/MqttClientProvider.js';
import { ConfigService } from './ConfigService.js';
import { MqttTopicService } from './MqttTopicService.js';
import { MqttTracingService } from './MqttTracingService.js';
import { BaseLogger, Logger } from '@radoslavirha/tsed-logger';

/** QoS used for outbound notification publishes. */
const QOS = 1;

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
    private readonly logger: BaseLogger;

    constructor(
        private readonly configService: ConfigService,
        @Inject(MqttClientProvider) private readonly mqttClient: MqttClient | null,
        private readonly mqttTopicService: MqttTopicService,
        private readonly mqttTracingService: MqttTracingService,
        logger: Logger
    ) {
        this.logger = logger.child('NOTIFICATION_DISPATCH');
    }

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
            void this.sendMqtt(payload);
        }
    }

    private async sendMqtt(payload: NotificationPayload): Promise<void> {
        const topic = this.mqttTopicService.getNotificationsTopic(payload.deviceId);
        const message = JSON.stringify({ [payload.property]: payload.value ?? null });

        await this.mqttTracingService.publish(
            {
                topic,
                topicTemplate: this.mqttTopicService.getNotificationsTopicTemplate(),
                qos: QOS,
                bodySize: Buffer.byteLength(message),
                attributes: { 'miot.device.id': payload.deviceId, 'miot.property': payload.property }
            },
            async (userProperties, span) => {
                try {
                    await this.mqttClient!.publishAsync(topic, message, { qos: QOS, properties: { userProperties } });
                    this.logger.debug('NOTIFICATION_MQTT_SENT', {
                        topic,
                        deviceId: payload.deviceId,
                        property: payload.property
                    });
                } catch (error) {
                    // Marked on the span but not rethrown, matching the other two transports:
                    // one unreachable notification sink must not stop the fan-out.
                    const reason = error instanceof Error ? error.message : String(error);
                    span.setStatus({ code: SpanStatusCode.ERROR, message: reason });
                    this.logger.warn('NOTIFICATION_MQTT_ERROR', {
                        topic,
                        deviceId: payload.deviceId,
                        property: payload.property,
                        message: reason
                    });
                }
            }
        );
    }

    private async sendHttp(address: string, payload: NotificationPayload): Promise<void> {
        try {
            const response = await fetch(address, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            this.logger.debug('NOTIFICATION_HTTP_SENT',{
                address,
                deviceId: payload.deviceId,
                property: payload.property,
                status: response.status
            });
        } catch (error) {
            this.logger.warn('NOTIFICATION_HTTP_ERROR',{
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
                this.logger.warn('Invalid UDP address format. Expected host:port.', { address });
                return resolve();
            }
            const host = address.slice(0, colonIndex);
            const port = parseInt(address.slice(colonIndex + 1), 10);
            if (CommonUtils.isNil(host) || isNaN(port)) {
                this.logger.warn('Invalid UDP address format. Expected host:port.', { address });
                return resolve();
            }

            const socket = createSocket('udp4');
            const message = `deviceId=${payload.deviceId}\n${payload.property}=${String(payload.value ?? '')}`;
            const buffer = Buffer.from(message, 'utf8');
            socket.send(buffer, port, host, (error) => {
                socket.close();
                if (CommonUtils.notNil(error)) {
                    this.logger.warn('NOTIFICATION_UDP_ERROR', {
                        address,
                        deviceId: payload.deviceId,
                        property: payload.property,
                        message: error.message
                    });
                } else {
                    this.logger.debug('NOTIFICATION_UDP_SENT', {
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
