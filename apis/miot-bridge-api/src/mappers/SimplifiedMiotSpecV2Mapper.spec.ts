import { PlatformTest } from '@tsed/platform-http/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MiotSpecV2 } from '../models/miot-spec-v2/index.js';
import { MiotSpecV2PropertyAccess } from '../models/miot-spec-v2/index.js';
import type { ModelPropertyOverride } from '../models/model-property-override/ModelPropertyOverride.js';
import { PropertyAccess } from '../models/simplified-miot-spec/PropertyAccess.enum.js';
import { MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE, MIOT_PROPERTY_SOURCE_VALUE_SPEC } from '../otel/telemetry.js';
import { SimplifiedMiotSpecV2Mapper } from './SimplifiedMiotSpecV2Mapper.js';

const PUBLISHED_KEY = 'vacuum:status';
/** The override table stores only the property half; the mapper prefixes the service key. */
const OVERRIDE_PROPERTY = 'sweep-mode';
const OVERRIDE_KEY = `vacuum:${OVERRIDE_PROPERTY}`;

const rawSpec = (): MiotSpecV2 =>
    ({
        type: 'urn:miot-spec-v2:device:vacuum:0000A006',
        description: 'Robot Cleaner',
        services: [
            {
                iid: 2,
                type: 'urn:miot-spec-v2:service:vacuum:00007810',
                description: 'Robot Cleaner',
                properties: [
                    {
                        iid: 1,
                        type: 'urn:miot-spec-v2:property:status:00000007',
                        description: 'Status',
                        access: [MiotSpecV2PropertyAccess.Read, MiotSpecV2PropertyAccess.Notify],
                        valueList: [{ value: 1, description: 'Sweeping' }]
                    }
                ]
            }
        ]
    }) as MiotSpecV2;

const override = (key: string): ModelPropertyOverride =>
    ({
        model: 'xiaomi.vacuum.c102gl',
        key,
        siid: 2,
        piid: 9,
        access: [PropertyAccess.Read, PropertyAccess.Write],
        values: [{ value: 0, description: 'Sweep' }]
    }) as ModelPropertyOverride;

describe('SimplifiedMiotSpecV2Mapper', () => {
    let mapper: SimplifiedMiotSpecV2Mapper;

    beforeEach(async () => {
        await PlatformTest.create();
        mapper = PlatformTest.get<SimplifiedMiotSpecV2Mapper>(SimplifiedMiotSpecV2Mapper);
    });

    afterEach(PlatformTest.reset);

    it('Should mark a published property as coming from the spec', async () => {
        const spec = await mapper.map(rawSpec());

        expect(spec.properties.get(PUBLISHED_KEY)?.source).toBe(MIOT_PROPERTY_SOURCE_VALUE_SPEC);
    });

    // The device's published spec is incomplete, so these entries exist precisely because nobody
    // upstream vouches for them. When the device refuses one, the blame is ours — which is only
    // answerable if the provenance is recorded at the moment the entry is inserted.
    it('Should mark an unpublished property as coming from an override', async () => {
        const spec = await mapper.map(rawSpec(), [override(OVERRIDE_PROPERTY)]);

        expect(spec.properties.get(OVERRIDE_KEY)?.source).toBe(MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE);
        expect(spec.properties.get(PUBLISHED_KEY)?.source).toBe(MIOT_PROPERTY_SOURCE_VALUE_SPEC);
    });

    // The case that makes reconstructing provenance later impossible: the key exists in both, and
    // the merged map keeps no record of who won. Whoever ended up in the map is who gets blamed.
    it('Should mark a published property replaced by an override as ours', async () => {
        const spec = await mapper.map(rawSpec(), [override(PUBLISHED_KEY.split(':')[1])]);

        const property = spec.properties.get(PUBLISHED_KEY);

        expect(property?.source).toBe(MIOT_PROPERTY_SOURCE_VALUE_OVERRIDE);
        expect(property?.piid).toBe(9);
    });

    it('Should skip an override whose service does not exist in the spec', async () => {
        const orphan = { ...override(OVERRIDE_PROPERTY), siid: 99 } as ModelPropertyOverride;

        const spec = await mapper.map(rawSpec(), [orphan]);

        expect(spec.properties.has(OVERRIDE_KEY)).toBe(false);
    });
});
