import { createSocket } from 'dgram';
import { Service, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import { CommonUtils } from '@radoslavirha/utils';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';
import { NotificationPayload } from '../models/NotificationPayload.js';
import { ConfigService } from './ConfigService.js';

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
    constructor(private readonly configService: ConfigService) {}

    /**
     * Receives a property-value observation and forwards it to all enabled
     * outbound notification transports (HTTP, UDP).
     */
    public receive(event: PropertyChangeEvent): void {
        const payload = CommonUtils.buildModel(NotificationPayload, {
            deviceId: event.deviceId,
            property: event.property,
            value: event.newValue
        });

        const config = this.configService.config.notifications;
        if (!config) return;

        if (config.http?.enabled && config.http.address) {
            void this.sendHttp(config.http.address, payload);
        }

        if (config.udp?.enabled && config.udp.address) {
            void this.sendUdp(config.udp.address, payload);
        }
    }

    // ─── Private ─────────────────────────────────────────────

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
            if (!host || isNaN(port)) {
                $log.warn({ event: 'NOTIFICATION_UDP_ERROR', address, message: 'Invalid UDP address format. Expected host:port.' });
                return resolve();
            }

            const socket = createSocket('udp4');
            const buffer = Buffer.from(JSON.stringify(payload), 'utf8');
            socket.send(buffer, port, host, (error) => {
                socket.close();
                if (error) {
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
