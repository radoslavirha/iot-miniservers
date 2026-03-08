import { z } from 'zod';

const HttpNotificationEnabledSchema = z.object({
    enabled: z.literal(true),
    address: z.string().describe('Target URL to POST notification payloads to, e.g. "http://192.168.1.100:5001/notify".')
});

const HttpNotificationDisabledSchema = z.object({
    enabled: z.literal(false).optional(),
    address: z.string().optional().describe('Target URL to POST notification payloads to, e.g. "http://192.168.1.100:5001/notify".')
});

export const HttpNotificationConfigSchema = z.union([HttpNotificationEnabledSchema, HttpNotificationDisabledSchema]);

export type HttpNotificationConfig = z.infer<typeof HttpNotificationConfigSchema>;

export const HttpConfigSchema = z.object({
    notifications: HttpNotificationConfigSchema.optional().describe('HTTP notification settings.')
});

export type HttpConfig = z.infer<typeof HttpConfigSchema>;
