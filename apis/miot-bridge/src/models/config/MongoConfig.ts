import { z } from 'zod';

const ConnectionOptionsSchema = z.looseObject({
    user: z.string().optional().describe('Username for auth.'),
    pass: z.string().optional().describe('Password for auth.')
})
    .describe('Additional MongoDB connection options.');

const MongoEnabledSchema = z.object({
    enabled: z.literal(true),
    url: z.string().describe('MongoDB connection URL.'),
    connectionOptions: ConnectionOptionsSchema.optional()
});

const MongoDisabledSchema = z.object({
    enabled: z.literal(false).optional(),
    url: z.string().optional(),
    connectionOptions: ConnectionOptionsSchema.optional()
});

export const MongoConfigSchema = z.union([MongoEnabledSchema, MongoDisabledSchema]);

export type MongoConfig = z.infer<typeof MongoConfigSchema>;
