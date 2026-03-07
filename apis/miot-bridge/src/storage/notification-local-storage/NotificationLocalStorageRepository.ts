import { Injectable, Scope, ProviderScope } from '@tsed/di';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, resolve } from 'path';
import { Serializer } from '@radoslavirha/tsed-common';
import { ConfigService } from '../../services/ConfigService.js';
import { NotificationLocalStorageDTO } from './dto/NotificationLocalStorageDTO.js';

/**
 * Raw DTO-level file repository for notification subscriptions.
 * Reads and writes NotificationLocalStorageDTO objects to disk.
 * No domain knowledge — mapping is handled by NotificationLocalStorageService.
 */
@Injectable()
@Scope(ProviderScope.SINGLETON)
export class NotificationLocalStorageRepository {
    private readonly filePath: string;

    constructor(readonly config: ConfigService) {
        this.filePath = resolve(process.cwd(), config.config.cachePath ?? './cache', 'notifications.json');
    }

    async getAll(): Promise<NotificationLocalStorageDTO[]> {
        return this.read();
    }

    async getById(id: string): Promise<NotificationLocalStorageDTO | undefined> {
        const items = await this.read();
        return items.find(n => n.id === id);
    }

    async getAllByDeviceId(deviceId: string): Promise<NotificationLocalStorageDTO[]> {
        const items = await this.read();
        return items.filter(n => n.deviceId === deviceId);
    }

    async create(dto: Omit<NotificationLocalStorageDTO, 'id'>): Promise<NotificationLocalStorageDTO> {
        const items = await this.read();
        const created: NotificationLocalStorageDTO = { ...dto, id: crypto.randomUUID() };
        items.push(created);
        await this.write(items);
        return created;
    }

    async deleteById(id: string): Promise<void> {
        const items = await this.read();
        await this.write(items.filter(n => n.id !== id));
    }

    async deleteAllByDeviceId(deviceId: string): Promise<void> {
        const items = await this.read();
        await this.write(items.filter(n => n.deviceId !== deviceId));
    }

    private async read(): Promise<NotificationLocalStorageDTO[]> {
        if (!existsSync(this.filePath)) {
            return [];
        }
        const raw = await readFile(this.filePath, 'utf-8');
        return Serializer.deserializeArray(JSON.parse(raw), NotificationLocalStorageDTO);
    }

    private async write(items: NotificationLocalStorageDTO[]): Promise<void> {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, JSON.stringify(Serializer.serialize(items, Array), null, 2), 'utf-8');
    }
}
