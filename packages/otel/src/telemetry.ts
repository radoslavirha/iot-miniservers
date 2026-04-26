import { metrics, trace, type Meter, type Tracer } from '@opentelemetry/api';

/**
 * Returns a Meter from the global meter provider.
 * No-op when the OpenTelemetry SDK is not initialized.
 *
 * @example
 * const meter = getMeter('notification-service');
 * const counter = meter.createCounter('notifications_processed_total');
 * counter.add(1, { status: 'ok' });
 */
export const getMeter = (name: string, version?: string): Meter => {
    return metrics.getMeter(name, version);
};

/**
 * Returns a Tracer from the global tracer provider.
 * No-op when the OpenTelemetry SDK is not initialized.
 *
 * @example
 * const tracer = getTracer('device-service');
 * return tracer.startActiveSpan('fetchDevice', async (span) => {
 *     try {
 *         return await this.endpoint.getDevice(id);
 *     } catch (error) {
 *         span.recordException(error as Error);
 *         throw error;
 *     } finally {
 *         span.end();
 *     }
 * });
 */
export const getTracer = (name: string, version?: string): Tracer => {
    return trace.getTracer(name, version);
};
