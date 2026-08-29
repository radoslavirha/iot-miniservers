import { z } from 'zod';

export const RedirectConfigSchema = z.object({
    baseURL: z.string().describe('Public base URL a scanner reaches, with no path of its own (e.g. http://qr.home). Combined with the generated slug to compose the URL encoded into each printed QR image. Deliberately does NOT include the /r prefix the redirect controller is mounted under: on qr.home a Traefik addPrefix middleware adds it, which is what keeps the printed URL short and the admin paths off that host. On a host without that middleware (the shared api.<domain>/iot/qr-manager route) the /r must be part of this value. Distinct from BaseConfig.publicURL (admin API URL) and from per-record targetURL (the actual redirect destination, stored in DB and free-form).')
});

export type RedirectConfig = z.infer<typeof RedirectConfigSchema>;
