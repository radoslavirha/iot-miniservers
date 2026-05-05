import type { IAuthStrategy } from './IAuthStrategy.js';

export class NoAuthStrategy implements IAuthStrategy {
    public async getCredentials(): Promise<Record<string, string>> {
        return {};
    }

    public invalidate(): void {
        // Nothing to invalidate
    }
}
