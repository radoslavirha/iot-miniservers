import { Service, Scope, ProviderScope } from '@tsed/di';
import { $log } from '@tsed/logger';
import type { PropertyChangeEvent } from '../models/PropertyChangeEvent.js';

/**
 * Central hub for all inbound property-value observations, regardless of transport.
 *
 * Sources:
 * - {@link DevicePropertyPollerService} — periodic polls (`PROPERTY_CHANGED` events)
 * - {@link DeviceCommandService} — direct GET_PROPERTY calls via HTTP / UDP / MQTT
 *
 * Outbound dispatching (UDP / HTTP / MQTT notifications) is wired in Phase 6.2.
 */
@Service()
@Scope(ProviderScope.SINGLETON)
export class NotificationDispatchService {
    /**
     * Receives a property-value observation and (in future phases) forwards it
     * to all configured notification transports.
     *
     * @param event - The property-change event containing device, property, and value info.
     */
    public receive(event: PropertyChangeEvent): void {
        $log.info({
            message: 'NotificationDispatchService.receive',
            deviceId: event.deviceId,
            property: event.property,
            oldValue: event.oldValue,
            newValue: event.newValue,
            timestamp: event.timestamp
        });
    }
}
