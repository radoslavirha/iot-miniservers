import { z } from 'zod';

const UdpNotificationEnabledSchema = z.object({
    enabled: z.literal(true),
    address: z.string().describe('Target address in host:port format, e.g. "192.168.1.100:5000".')
});

const UdpNotificationDisabledSchema = z.object({
    enabled: z.literal(false).optional(),
    address: z.string().optional().describe('Target address in host:port format, e.g. "192.168.1.100:5000".')
});

export const UdpNotificationConfigSchema = z.union([UdpNotificationEnabledSchema, UdpNotificationDisabledSchema]);

export type UdpNotificationConfig = z.infer<typeof UdpNotificationConfigSchema>;

const UdpEnabledSchema = z.looseObject({
    enabled: z.literal(true),
    port: z.number().describe('UDP port to listen on.'),
    notifications: UdpNotificationConfigSchema.optional().describe('UDP notification settings.')
});

const UdpDisabledSchema = z.looseObject({
    enabled: z.literal(false).optional(),
    port: z.number().optional().describe('UDP port to listen on.'),
    notifications: UdpNotificationConfigSchema.optional().describe('UDP notification settings.')
});

export const UdpConfigSchema = z.union([UdpEnabledSchema, UdpDisabledSchema]);

export type UdpConfig = z.infer<typeof UdpConfigSchema>;
