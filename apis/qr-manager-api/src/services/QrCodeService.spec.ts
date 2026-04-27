import { describe, expect, it, vi, beforeEach } from 'vitest';
import { INSERT_ATTEMPTS } from '../constants.js';
import { QrCodeMongoDTO } from '../storage/qr-mongo/dto/QrCodeMongoDTO.js';
import { QrCodeMongoRepository } from '../storage/qr-mongo/QrCodeMongoRepository.js';
import { MongoQrCodeMapper } from '../mappers/MongoQrCodeMapper.js';
import { QrType } from '../models/QrType.enum.js';
import { QrCodeService } from './QrCodeService.js';
import { ShortIdService } from './ShortIdService.js';

const dto = (overrides: Partial<QrCodeMongoDTO> = {}): QrCodeMongoDTO => Object.assign(new QrCodeMongoDTO(), {
    _id: '671b00000000000000000001',
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: QrType.IOT_DEVICE,
    active: true,
    ...overrides
});

const buildService = (overrides: {
    repo?: Partial<QrCodeMongoRepository>;
    short?: Partial<ShortIdService>;
} = {}): { service: QrCodeService; repo: QrCodeMongoRepository; short: ShortIdService } => {
    const repo = {
        findAll: vi.fn(),
        findById: vi.fn(),
        findBySlug: vi.fn(),
        create: vi.fn(),
        updateById: vi.fn(),
        deleteById: vi.fn(),
        ...overrides.repo
    } as unknown as QrCodeMongoRepository;
    const short = {
        generate: vi.fn().mockReturnValue('x7k2'),
        ...overrides.short
    } as unknown as ShortIdService;
    const mapper = new MongoQrCodeMapper();
    const service = new QrCodeService(repo, mapper, short);
    return { service, repo, short };
};

beforeEach(() => {
    vi.restoreAllMocks();
});

describe('QrCodeService.create', () => {
    it('generates a slug, persists and returns the mapped domain model', async () => {
        const { service, repo, short } = buildService({
            repo: { create: vi.fn().mockResolvedValue(dto({ slug: 'x7k2' })) }
        });
        const created = await service.create({
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE,
            active: true
        });
        expect(short.generate).toHaveBeenCalledTimes(1);
        expect(repo.create).toHaveBeenCalledTimes(1);
        expect(created.slug).toBe('x7k2');
        expect(created.id).toBe('671b00000000000000000001');
    });

    it('retries when the slug collides with an existing record', async () => {
        const collision = Object.assign(new Error('dup'), { code: 11000, keyPattern: { slug: 1 } });
        const create = vi.fn()
            .mockRejectedValueOnce(collision)
            .mockResolvedValueOnce(dto({ slug: 'b0t2' }));
        const generate = vi.fn().mockReturnValueOnce('x7k2').mockReturnValueOnce('b0t2');
        const { service } = buildService({ repo: { create }, short: { generate } });
        const created = await service.create({
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE,
            active: true
        });
        expect(create).toHaveBeenCalledTimes(2);
        expect(generate).toHaveBeenCalledTimes(2);
        expect(created.slug).toBe('b0t2');
    });

    it('rethrows duplicate-key errors that are not on the slug index', async () => {
        const otherDup = Object.assign(new Error('dup'), { code: 11000, keyPattern: { other: 1 } });
        const { service } = buildService({ repo: { create: vi.fn().mockRejectedValue(otherDup) } });
        await expect(service.create({
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE,
            active: true
        })).rejects.toBe(otherDup);
    });

    it(`throws Conflict after ${INSERT_ATTEMPTS} retry attempts`, async () => {
        const collision = Object.assign(new Error('dup'), { code: 11000, keyPattern: { slug: 1 } });
        const { service } = buildService({ repo: { create: vi.fn().mockRejectedValue(collision) } });
        await expect(service.create({
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE,
            active: true
        })).rejects.toThrow(/unique slug/);
    });
});

describe('QrCodeService getters', () => {
    it('list returns mapped models', async () => {
        const { service } = buildService({
            repo: { findAll: vi.fn().mockResolvedValue([dto(), dto({ _id: 'b', slug: 'aaaa' })]) }
        });
        const items = await service.list({ type: QrType.IOT_DEVICE, active: true });
        expect(items).toHaveLength(2);
        expect(items[0].slug).toBe('x7k2');
    });

    it('getById returns undefined when not found', async () => {
        const { service } = buildService({ repo: { findById: vi.fn().mockResolvedValue(null) } });
        expect(await service.getById('missing')).toBeUndefined();
    });

    it('getById returns the mapped model when found', async () => {
        const { service } = buildService({ repo: { findById: vi.fn().mockResolvedValue(dto()) } });
        const result = await service.getById('671b00000000000000000001');
        expect(result?.slug).toBe('x7k2');
    });

    it('getBySlug returns the mapped model when found', async () => {
        const { service } = buildService({ repo: { findBySlug: vi.fn().mockResolvedValue(dto()) } });
        const result = await service.getBySlug('x7k2');
        expect(result?.slug).toBe('x7k2');
    });

    it('getBySlug returns undefined when not found', async () => {
        const { service } = buildService({ repo: { findBySlug: vi.fn().mockResolvedValue(null) } });
        expect(await service.getBySlug('zzzz')).toBeUndefined();
    });
});

describe('QrCodeService.update', () => {
    it('returns the mapped model when the document exists', async () => {
        const { service } = buildService({
            repo: { updateById: vi.fn().mockResolvedValue(dto({ targetURL: 'https://new.home' })) }
        });
        const result = await service.update('id', { targetURL: 'https://new.home' });
        expect(result?.targetURL).toBe('https://new.home');
    });

    it('returns undefined when the document does not exist', async () => {
        const { service } = buildService({ repo: { updateById: vi.fn().mockResolvedValue(null) } });
        expect(await service.update('missing', { active: false })).toBeUndefined();
    });
});

describe('QrCodeService.delete', () => {
    it('delegates to the repository', async () => {
        const { service, repo } = buildService();
        await service.delete('id');
        expect(repo.deleteById).toHaveBeenCalledWith('id');
    });
});
