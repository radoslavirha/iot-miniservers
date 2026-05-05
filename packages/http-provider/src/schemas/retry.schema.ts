import { z } from 'zod';

export const RetryConfigSchema = z.object({
    count: z.number().int().min(0).default(3),
    delay: z.number().int().min(0).default(1000),
    statusCodes: z.array(z.number().int()).default([500, 502, 503, 504])
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;
