import { readFile } from 'node:fs/promises';
import { SignJWT, importPKCS8 } from 'jose';
import type { JwtSelfSignedAuth } from '../schemas/auth.schema.js';
import type { IAuthStrategy } from './IAuthStrategy.js';

const EXPIRY_BUFFER_SECONDS = 30;

export class JwtSelfSignedStrategy implements IAuthStrategy {
    private cachedToken: string | undefined;
    private expiresAt: number | undefined;

    public constructor(private readonly config: JwtSelfSignedAuth) {}

    public async getCredentials(): Promise<Record<string, string>> {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const isExpired = this.expiresAt !== undefined && nowSeconds >= this.expiresAt - EXPIRY_BUFFER_SECONDS;

        if (!this.cachedToken || isExpired) {
            this.cachedToken = await this.generateToken();
            this.expiresAt = nowSeconds + this.config.claims.exp;
        }
        return { value: this.cachedToken };
    }

    public invalidate(): void {
        this.cachedToken = undefined;
        this.expiresAt = undefined;
    }

    private async generateToken(): Promise<string> {
        const { algorithm, claims, key } = this.config;

        const keyMaterial = key.source === 'file'
            ? (await readFile(key.path, 'utf-8')).trim()
            : key.value;

        const cryptoKey = await this.importKey(keyMaterial, algorithm);

        const payload: Record<string, unknown> = { ...claims.additionalClaims };

        const jwt = new SignJWT(payload)
            .setProtectedHeader({ alg: algorithm });

        if (claims.iss) jwt.setIssuer(claims.iss);
        if (claims.sub) jwt.setSubject(claims.sub);
        if (claims.aud) jwt.setAudience(claims.aud);
        jwt.setIssuedAt();
        jwt.setExpirationTime(`${claims.exp}s`);

        return jwt.sign(cryptoKey);
    }

    private async importKey(keyMaterial: string, algorithm: string): Promise<CryptoKey> {
        if (algorithm === 'HS256') {
            const { createSecretKey } = await import('node:crypto');
            const nodeKey = createSecretKey(Buffer.from(keyMaterial, 'utf-8'));
            // jose accepts KeyLike which includes node CryptoKey and KeyObject
            return nodeKey as unknown as CryptoKey;
        }
        if (algorithm === 'RS256' || algorithm === 'ES256') {
            return importPKCS8(keyMaterial, algorithm) as unknown as CryptoKey;
        }
        throw new Error(`Unsupported JWT algorithm: ${algorithm}`);
    }
}
