import { metrics, trace } from '@opentelemetry/api';
import type { Meter, Tracer } from '@opentelemetry/api';

/**
 * Returns a meter for the given instrumentation scope name.
 * Returns a no-op meter when the OTEL SDK is not initialised (e.g. in tests).
 */
export const getMeter = (name: string): Meter => {
    return metrics.getMeter(name);
};

/**
 * Returns a tracer for the given instrumentation scope name.
 * Returns a no-op tracer when the OTEL SDK is not initialised (e.g. in tests).
 */
export const getTracer = (name: string): Tracer => {
    return trace.getTracer(name);
};
