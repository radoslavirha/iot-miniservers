import { z } from 'zod';
import { TransportSchema } from './transport.schema.js';

export enum AuthStrategy {
    None = 'none',
    KubernetesServiceAccount = 'kubernetes-service-account',
    TokenExchange = 'token-exchange',
    JwtSelfSigned = 'jwt-self-signed'
}

// ─── Kubernetes Service Account ──────────────────────────────────────────────

const K8S_DEFAULT_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

const K8S_DEFAULT_TRANSPORT = {
    headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
};

export const KubernetesServiceAccountAuthSchema = z.object({
    strategy: z.literal(AuthStrategy.KubernetesServiceAccount),
    tokenPath: z.string().default(K8S_DEFAULT_TOKEN_PATH),
    transport: TransportSchema.default(K8S_DEFAULT_TRANSPORT)
});

// ─── Token Exchange ───────────────────────────────────────────────────────────

export const TokenExtractorEntrySchema = z.object({
    field: z.string(),
    as: z.string()
});

const TokenExtractorSchema = z.union([
    z.string().transform((s): z.infer<typeof TokenExtractorEntrySchema>[] => [{ field: s, as: 'value' }]),
    z.array(TokenExtractorEntrySchema)
]);

export const TokenExchangeRequestSchema = z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH']).default('POST'),
    url: z.url(),
    headers: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    queryParams: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
    body: z.record(z.string(), z.unknown()).optional()
});

export const TokenExchangeAuthSchema = z.object({
    strategy: z.literal(AuthStrategy.TokenExchange),
    request: TokenExchangeRequestSchema,
    tokenExtractor: TokenExtractorSchema,
    transport: TransportSchema
});

// ─── JWT Self-Signed ──────────────────────────────────────────────────────────

const JWT_DEFAULT_TRANSPORT = {
    headers: [{ name: 'Authorization', value: 'Bearer {{value}}' }]
};

export const JwtKeySchema = z.discriminatedUnion('source', [
    z.object({ source: z.literal('file'), path: z.string() }),
    z.object({ source: z.literal('value'), value: z.string() })
]);

export const JwtClaimsSchema = z.object({
    iss: z.string().optional(),
    sub: z.string().optional(),
    aud: z.union([z.string(), z.array(z.string())]).optional(),
    exp: z.number().int().positive().default(3600),
    additionalClaims: z.record(z.string(), z.unknown()).optional()
});

export const JwtSelfSignedAuthSchema = z.object({
    strategy: z.literal(AuthStrategy.JwtSelfSigned),
    key: JwtKeySchema,
    algorithm: z.enum(['RS256', 'ES256', 'HS256']).default('RS256'),
    claims: JwtClaimsSchema.default({ exp: 3600 }),
    transport: TransportSchema.default(JWT_DEFAULT_TRANSPORT)
});

// ─── No Auth ──────────────────────────────────────────────────────────────────

export const NoAuthSchema = z.object({
    strategy: z.literal(AuthStrategy.None).optional()
});

// ─── Auth Config (discriminated union + static transport fallback) ────────────

export const AuthConfigSchema = z.union([
    KubernetesServiceAccountAuthSchema,
    TokenExchangeAuthSchema,
    JwtSelfSignedAuthSchema,
    NoAuthSchema.extend({ transport: TransportSchema.optional() })
]);

export type KubernetesServiceAccountAuth = z.infer<typeof KubernetesServiceAccountAuthSchema>;
export type TokenExtractorEntry = z.infer<typeof TokenExtractorEntrySchema>;
export type TokenExchangeRequest = z.infer<typeof TokenExchangeRequestSchema>;
export type TokenExchangeAuth = z.infer<typeof TokenExchangeAuthSchema>;
export type JwtKey = z.infer<typeof JwtKeySchema>;
export type JwtClaims = z.infer<typeof JwtClaimsSchema>;
export type JwtSelfSignedAuth = z.infer<typeof JwtSelfSignedAuthSchema>;
export type AuthConfig = z.infer<typeof AuthConfigSchema>;
