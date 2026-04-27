import { z } from 'zod';

export const RedirectConfigSchema = z.object({
    baseURL: z.string().describe('Public base URL where this API serves GET /:slug (e.g. https://qr.home). Combined with the generated slug to compose the URL encoded into each printed QR image. Distinct from BaseConfig.publicURL (admin API URL) and from per-record targetURL (the actual redirect destination, stored in DB and free-form).')
});

export type RedirectConfig = z.infer<typeof RedirectConfigSchema>;
