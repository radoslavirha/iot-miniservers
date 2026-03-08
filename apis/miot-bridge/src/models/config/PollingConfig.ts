import { z } from 'zod';

/**
 * Device property polling configuration.
 * The poller reads all subscribed properties for each device at a fixed interval
 * and emits change events consumed by the notification dispatch pipeline.
 */
const PollingEnabledSchema = z.object({
    enabled: z.literal(true).default(true),
    intervalMs: z.number().default(15000).describe('Polling interval in milliseconds.'),
    dispatchOnChange: z.boolean().default(true).describe('When true, a notification is dispatched only when a property value changes. When false, dispatched on every cycle.'),
    maxErrorCount: z.number().default(3).describe('Number of consecutive device errors before the device is placed in back-off.'),
    errorSkipCycles: z.number().default(20).describe('Number of polling cycles to skip for a device after it reaches maxErrorCount consecutive errors.')
});

const PollingDisabledSchema = z.object({
    enabled: z.literal(false).optional(),
    intervalMs: z.number().default(15000).describe('Polling interval in milliseconds. Default: 15000.'),
    dispatchOnChange: z.boolean().default(true).describe('When true, a notification is dispatched only when a property value changes. When false, dispatched on every cycle.'),
    maxErrorCount: z.number().default(3).describe('Number of consecutive device errors before the device is placed in back-off.'),
    errorSkipCycles: z.number().default(20).describe('Number of polling cycles to skip for a device after it reaches maxErrorCount consecutive errors.')
});

export const PollingConfigSchema = z.union([PollingEnabledSchema, PollingDisabledSchema]);

export type PollingConfig = z.infer<typeof PollingConfigSchema>;
