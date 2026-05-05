import { readFile } from 'node:fs/promises';
import type { KubernetesServiceAccountAuth } from '../schemas/auth.schema.js';
import type { IAuthStrategy } from './IAuthStrategy.js';

export class KubernetesServiceAccountStrategy implements IAuthStrategy {
    public constructor(private readonly config: KubernetesServiceAccountAuth) {}

    public async getCredentials(): Promise<Record<string, string>> {
        const token = (await readFile(this.config.tokenPath, 'utf-8')).trim();
        return { value: token };
    }

    public invalidate(): void {}
}
