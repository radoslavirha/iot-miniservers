import { z } from 'zod';
import { AuthConfigSchema } from './auth.schema.js';
import { RetryConfigSchema } from './retry.schema.js';

export const HttpProviderEntrySchema = z.object({
    baseURL: z.url(),
    auth: AuthConfigSchema.optional(),
    retry: RetryConfigSchema.optional()
});

export type HttpProviderEntry = z.infer<typeof HttpProviderEntrySchema>;
