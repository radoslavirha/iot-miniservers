import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { Serializer } from '@radoslavirha/tsed-common';
import { ConfigService } from '../../services/ConfigService.js';
import { ModelPropertyOverrideLocalStorageDTO } from './dto/ModelPropertyOverrideLocalStorageDTO.js';

/**
 * Raw DTO-level file repository for model property overrides.
 * Reads and writes ModelPropertyOverrideLocalStorageDTO objects to disk.
 * No domain knowledge — mapping is handled by ModelPropertyOverrideService.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class ModelPropertyOverrideRepository {
    private readonly filePath: string;

    constructor(readonly config: ConfigService) {
        this.filePath = resolve(process.cwd(), config.config.cachePath ?? './cache', 'model-property-overrides.json');
    }

    public async getAll(): Promise<ModelPropertyOverrideLocalStorageDTO[]> {
        return this.read();
    }

    public async getById(id: string): Promise<ModelPropertyOverrideLocalStorageDTO | undefined> {
        const items = await this.read();
        return items.find(o => o.id === id);
    }

    public async getByModel(model: string): Promise<ModelPropertyOverrideLocalStorageDTO[]> {
        const items = await this.read();
        return items.filter(o => o.model === model);
    }

    public async create(
        dto: Omit<ModelPropertyOverrideLocalStorageDTO, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<ModelPropertyOverrideLocalStorageDTO> {
        const items = await this.read();
        const now = new Date();
        const created: ModelPropertyOverrideLocalStorageDTO = { ...dto, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
        items.push(created);
        await this.write(items);
        return created;
    }

    public async delete(id: string): Promise<void> {
        const items = await this.read();
        await this.write(items.filter(o => o.id !== id));
    }

    private async read(): Promise<ModelPropertyOverrideLocalStorageDTO[]> {
        if (!existsSync(this.filePath)) {
            return [];
        }
        const raw = await readFile(this.filePath, 'utf-8');
        return Serializer.deserializeArray(JSON.parse(raw), ModelPropertyOverrideLocalStorageDTO);
    }

    private async write(items: ModelPropertyOverrideLocalStorageDTO[]): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(Serializer.serialize(items, Array), null, 2), 'utf-8');
    }
}
