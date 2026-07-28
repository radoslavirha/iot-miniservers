import { ResilienceConfigSchema } from '@radoslavirha/resilience';
import { z } from 'zod';
import { AuthConfigSchema } from './auth.schema.js';

export const HttpProviderEntrySchema = z.object({
    baseURL: z.url(),
    auth: AuthConfigSchema.optional(),
    // Full resilience config (timeout + retry + circuit breaker).
    resilience: ResilienceConfigSchema.optional()
});

export type HttpProviderEntry = z.input<typeof HttpProviderEntrySchema>;
