import { describe, beforeEach, afterEach, expect, it } from 'vitest';
import { PlatformTest } from '@tsed/platform-http/testing';
import { TestContainersMongo } from '@tsed/testcontainers-mongo';
import { isTaskCancelledError } from '@radoslavirha/resilience';
import { Server } from '../../Server.js';
import { QrType } from '../../models/QrType.enum.js';
import { QrCodeMongoRepository } from './QrCodeMongoRepository.js';

const buildCreatePayload = (overrides: Record<string, unknown> = {}) => ({
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: QrType.IOT_DEVICE,
    active: true,
    ...overrides
});

describe('QrCodeMongoRepository', () => {
    let repository: QrCodeMongoRepository;

    beforeEach(() => TestContainersMongo.create(Server));
    beforeEach(() => {
        repository = PlatformTest.get<QrCodeMongoRepository>(QrCodeMongoRepository);
    });
    afterEach(() => TestContainersMongo.reset());

    describe('create', () => {
        it('persists a document and returns the saved DTO', async () => {
            expect.assertions(5);
            const result = await repository.create(buildCreatePayload());
            expect(result._id).toBeDefined();
            expect(result.slug).toBe('x7k2');
            expect(result.targetURL).toBe('https://iot-ui.home/devices/shelf-1');
            expect(result.label).toBe('Shelf 1');
            expect(result.active).toBe(true);
        });

        it('sets createdAt and updatedAt timestamps automatically', async () => {
            expect.assertions(2);
            const result = await repository.create(buildCreatePayload());
            expect(result.createdAt).toBeInstanceOf(Date);
            expect(result.updatedAt).toBeInstanceOf(Date);
        });
    });

    describe('findAll', () => {
        it('returns all documents when no filter is given', async () => {
            expect.assertions(1);
            await repository.create(buildCreatePayload({ slug: 'aaaa' }));
            await repository.create(buildCreatePayload({ slug: 'bbbb', type: QrType.PLANT }));
            const results = await repository.findAll();
            expect(results).toHaveLength(2);
        });

        it('filters by type', async () => {
            expect.assertions(2);
            await repository.create(buildCreatePayload({ slug: 'aaaa', type: QrType.IOT_DEVICE }));
            await repository.create(buildCreatePayload({ slug: 'bbbb', type: QrType.PLANT }));
            const results = await repository.findAll({ type: QrType.PLANT });
            expect(results).toHaveLength(1);
            expect(results[0].type).toBe(QrType.PLANT);
        });

        it('filters by active', async () => {
            expect.assertions(2);
            await repository.create(buildCreatePayload({ slug: 'aaaa', active: true }));
            await repository.create(buildCreatePayload({ slug: 'bbbb', active: false }));
            const results = await repository.findAll({ active: false });
            expect(results).toHaveLength(1);
            expect(results[0].slug).toBe('bbbb');
        });

        it('filters by type and active combined', async () => {
            expect.assertions(2);
            await repository.create(buildCreatePayload({ slug: 'aaaa', type: QrType.IOT_DEVICE, active: true }));
            await repository.create(buildCreatePayload({ slug: 'bbbb', type: QrType.IOT_DEVICE, active: false }));
            await repository.create(buildCreatePayload({ slug: 'cccc', type: QrType.PLANT, active: true }));
            const results = await repository.findAll({ type: QrType.IOT_DEVICE, active: true });
            expect(results).toHaveLength(1);
            expect(results[0].slug).toBe('aaaa');
        });

        it('returns an empty array when no documents match the filter', async () => {
            expect.assertions(1);
            await repository.create(buildCreatePayload({ type: QrType.IOT_DEVICE }));
            const results = await repository.findAll({ type: QrType.PLANT });
            expect(results).toHaveLength(0);
        });
    });

    describe('findById', () => {
        it('returns the document when it exists', async () => {
            expect.assertions(2);
            const created = await repository.create(buildCreatePayload());
            const result = await repository.findById(created._id);
            expect(result).not.toBeNull();
            expect(result!.slug).toBe('x7k2');
        });

        it('returns null when the id does not exist', async () => {
            expect.assertions(1);
            const result = await repository.findById('671b00000000000000000001');
            expect(result).toBeNull();
        });
    });

    describe('findBySlug', () => {
        it('returns the document when the slug exists', async () => {
            expect.assertions(2);
            await repository.create(buildCreatePayload({ slug: 'x7k2' }));
            const result = await repository.findBySlug('x7k2');
            expect(result).not.toBeNull();
            expect(result!.targetURL).toBe('https://iot-ui.home/devices/shelf-1');
        });

        it('returns null when the slug does not exist', async () => {
            expect.assertions(1);
            const result = await repository.findBySlug('zzzz');
            expect(result).toBeNull();
        });

        it('rejects fast when the caller signal is already aborted', async () => {
            expect.assertions(1);
            await repository.create(buildCreatePayload({ slug: 'x7k2' }));
            const controller = new AbortController();
            controller.abort();

            await expect(repository.findBySlug('x7k2', controller.signal)).rejects.toSatisfy(isTaskCancelledError);
        });
    });

    describe('updateById', () => {
        it('updates the document and returns the updated DTO', async () => {
            expect.assertions(3);
            const created = await repository.create(buildCreatePayload());
            const result = await repository.updateById(created._id, { targetURL: 'https://new.home', active: false });
            expect(result).not.toBeNull();
            expect(result!.targetURL).toBe('https://new.home');
            expect(result!.active).toBe(false);
        });

        it('preserves unchanged fields', async () => {
            expect.assertions(2);
            const created = await repository.create(buildCreatePayload());
            const result = await repository.updateById(created._id, { active: false });
            expect(result!.slug).toBe('x7k2');
            expect(result!.label).toBe('Shelf 1');
        });

        it('returns null when the id does not exist', async () => {
            expect.assertions(1);
            const result = await repository.updateById('671b00000000000000000001', { active: false });
            expect(result).toBeNull();
        });
    });

    describe('deleteById', () => {
        it('removes the document from the collection', async () => {
            expect.assertions(1);
            const created = await repository.create(buildCreatePayload());
            await repository.deleteById(created._id);
            const result = await repository.findById(created._id);
            expect(result).toBeNull();
        });

        it('does not throw when the id does not exist', async () => {
            expect.assertions(0);
            await repository.deleteById('671b00000000000000000001');
        });
    });
});
