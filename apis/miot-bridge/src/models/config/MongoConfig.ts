import { z } from 'zod';

const MongoEnabledSchema = z.object({
    enabled: z.literal(true),
    url: z.string().describe('MongoDB connection URL.'),
    connectionOptions: z.record(z.string(), z.unknown()).optional().describe('Additional MongoDB connection options. See https://www.npmjs.com/package/mongodb#options for details.')
});

const MongoDisabledSchema = z.object({
    enabled: z.literal(false).optional(),
    url: z.string().optional(),
    connectionOptions: z.record(z.string(), z.unknown()).optional().describe('Additional MongoDB connection options. See https://www.npmjs.com/package/mongodb#options for details.')
});

export const MongoConfigSchema = z.union([MongoEnabledSchema, MongoDisabledSchema]);

export type MongoConfig = z.infer<typeof MongoConfigSchema>;
