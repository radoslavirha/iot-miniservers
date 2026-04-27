import { describe, expect, it } from 'vitest';
import { CommonUtils } from '@radoslavirha/utils';
import { QrCode } from '../models/QrCode.js';
import { QrType } from '../models/QrType.enum.js';
import { QrCodeMongoDTO } from '../storage/qr-mongo/dto/QrCodeMongoDTO.js';
import { MongoQrCodeMapper } from './MongoQrCodeMapper.js';

const buildDto = (overrides: Partial<QrCodeMongoDTO> = {}): QrCodeMongoDTO => Object.assign(new QrCodeMongoDTO(), {
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

describe('MongoQrCodeMapper', () => {
    const mapper = new MongoQrCodeMapper();

    it('maps a Mongo document to the domain model', () => {
        const model = mapper.mongoToModel(buildDto());
        expect(model.id).toBe('671b00000000000000000001');
        expect(model.slug).toBe('x7k2');
        expect(model.targetURL).toBe('https://iot-ui.home/devices/shelf-1');
        expect(model.label).toBe('Shelf 1');
        expect(model.type).toBe(QrType.IOT_DEVICE);
        expect(model.active).toBe(true);
    });

    it('builds a create payload that strips base fields', () => {
        const payload = mapper.buildMongoCreate({
            slug: 'x7k2',
            targetURL: 'https://iot-ui.home/devices/shelf-1',
            label: 'Shelf 1',
            type: QrType.IOT_DEVICE,
            active: true
        });
        expect(payload.slug).toBe('x7k2');
        expect(payload).not.toHaveProperty('_id');
        expect(payload).not.toHaveProperty('createdAt');
    });

    it('builds an update payload from a partial entity', () => {
        const payload = mapper.buildMongoUpdate({ targetURL: 'https://new.home', active: false });
        expect(payload.targetURL).toBe('https://new.home');
        expect(payload.active).toBe(false);
        expect(payload.slug).toBeUndefined();
    });

    it('round-trips through model and back via build payloads', () => {
        const dto = buildDto();
        const model = mapper.mongoToModel(dto);
        const create = mapper.buildMongoCreate({
            slug: model.slug,
            targetURL: model.targetURL,
            label: model.label,
            type: model.type,
            active: model.active
        });
        // ignore base fields, only domain ones must round-trip
        const rebuilt = CommonUtils.buildModelStrict(QrCode, {
            id: dto._id,
            createdAt: dto.createdAt,
            updatedAt: dto.updatedAt,
            slug: create.slug,
            targetURL: create.targetURL,
            label: create.label,
            type: create.type,
            active: create.active
        });
        expect(rebuilt).toEqual(model);
    });
});
