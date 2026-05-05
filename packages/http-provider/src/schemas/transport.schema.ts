import { z } from 'zod';

export const TransportHeaderSchema = z.object({
    name: z.string(),
    value: z.string()
});

export const TransportQueryParamSchema = z.object({
    name: z.string(),
    value: z.string()
});

export const TransportSchema = z.object({
    headers: z.array(TransportHeaderSchema).optional(),
    queryParams: z.array(TransportQueryParamSchema).optional()
});

export type TransportHeader = z.infer<typeof TransportHeaderSchema>;
export type TransportQueryParam = z.infer<typeof TransportQueryParamSchema>;
export type TransportConfig = z.infer<typeof TransportSchema>;
