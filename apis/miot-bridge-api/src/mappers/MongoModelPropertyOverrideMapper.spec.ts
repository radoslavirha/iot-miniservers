import { PlatformTest } from '@tsed/platform-http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import type { ModelPropertyOverrideMongoDTO } from '../storage/model-property-override-mongo/dto/ModelPropertyOverrideMongoDTO.js';
import { ModelPropertyOverrideAccessMongoDTO } from '../storage/model-property-override-mongo/dto/ModelPropertyOverrideAccessMongoDTO.enum.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MongoModelPropertyOverrideMapper } from './MongoModelPropertyOverrideMapper.js';

const MODEL = 'xiaomi.vacuum.c102gl';
const KEY = 'sweep-mode';

const entity = (): Omit<ModelPropertyOverride, 'id' | 'createdAt' | 'updatedAt'> =>
    ({
        model: MODEL,
        key: KEY,
        siid: 2,
        piid: 6,
        access: [PropertyAccess.Read, PropertyAccess.Write],
        values: [{ value: 2, description: 'Vacuuming' }]
    }) as ModelPropertyOverride;

/** Double cast: `BaseMongo` requires `_id` and the timestamps, none of which this mapper reads. */
const document = (): ModelPropertyOverrideMongoDTO =>
    ({
        id: '69b597d55fc5dffc453caf61',
        modelName: MODEL,
        key: KEY,
        siid: 2,
        piid: 6,
        access: [ModelPropertyOverrideAccessMongoDTO.Read, ModelPropertyOverrideAccessMongoDTO.Write],
        values: [{ value: 2, description: 'Vacuuming' }]
    }) as unknown as ModelPropertyOverrideMongoDTO;

describe('MongoModelPropertyOverrideMapper', () => {
    let mapper: MongoModelPropertyOverrideMapper;

    beforeEach(async () => {
        await PlatformTest.create();
        mapper = PlatformTest.get<MongoModelPropertyOverrideMapper>(MongoModelPropertyOverrideMapper);
    });

    afterEach(PlatformTest.reset);

    // The regression this file exists for. The document field is `modelName` and the domain field
    // is `model`; the write path wrote `model`, which is not in the schema, so Mongoose dropped it
    // and every override was stored unmatchable by `findByModel`. Nothing failed: the POST returned
    // 201, `getAll` kept listing the row, and the key simply stopped appearing in the merged spec.
    //
    // Asserting the *absence* of `model` matters as much as the presence of `modelName` — writing
    // both would round-trip through this mapper perfectly and still leave a schema-less field on
    // every new document.
    it('Should write the model into the modelName document field', async () => {
        const payload = await mapper.buildMongoCreate(entity());

        expect(payload).toMatchObject({ modelName: MODEL, key: KEY, siid: 2, piid: 6 });
        expect(payload).not.toHaveProperty('model');
    });

    it('Should map the access enum into its document members', async () => {
        const payload = await mapper.buildMongoCreate(entity());

        expect(payload.access).toEqual([
            ModelPropertyOverrideAccessMongoDTO.Read,
            ModelPropertyOverrideAccessMongoDTO.Write
        ]);
    });

    // The other half of the round trip: `findByModel` queries `modelName`, so a document read back
    // has to surface it as `model` for `SimplifiedMiotSpecV2Mapper` to key the override by service.
    it('Should read the modelName document field back into the domain model', async () => {
        const model = await mapper.mongoToModel(document());

        expect(model.model).toBe(MODEL);
        expect(model.key).toBe(KEY);
        expect(model.access).toEqual([PropertyAccess.Read, PropertyAccess.Write]);
    });
});
