import { ResilienceConfigSchema, type ResilienceConfig } from '@radoslavirha/resilience';
import { z } from 'zod';
import { AuthConfigSchema } from './auth.schema.js';
import { RetryConfigSchema } from './retry.schema.js';

export const HttpProviderEntrySchema = z.object({
    baseURL: z.url(),
    auth: AuthConfigSchema.optional(),
    // Legacy retry config (count/delay/statusCodes) — now feeds cockatiel's retry.
    retry: RetryConfigSchema.optional(),
    // Full resilience config (timeout + circuit breaker, plus optional retry override).
    resilience: ResilienceConfigSchema.optional()
});

// `retry` and `resilience` are exposed as their input types so callers may pass
// partial sections (e.g. `{ count: 1 }` or `{ circuitBreaker: {} }`); the factory
// applies defaults at runtime.
export type HttpProviderEntry = Omit<z.infer<typeof HttpProviderEntrySchema>, 'retry' | 'resilience'> & {
    retry?: z.input<typeof RetryConfigSchema>;
    resilience?: ResilienceConfig;
};
