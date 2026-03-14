import { AdditionalProperties, CollectionOf, Description, Enum, Example, Property, Required } from '@tsed/schema';
import { BaseModel } from '@radoslavirha/tsed-common';
import { MiotPropertyValue } from '../simplified-miot-spec/MiotPropertyValue.js';
import { PropertyAccess } from '../simplified-miot-spec/PropertyAccess.enum.js';

/**
 * A custom (undocumented) property for a specific device model.
 * Inserted into the parsed spec alongside official properties.
 */
@AdditionalProperties(false)
export class ModelPropertyOverride extends BaseModel {
    @Required()
    @Property(String)
    @Description('Device model identifier.')
    @Example('xiaomi.vacuum.c102gl')
    public model: string;

    @Required()
    @Property(String)
    @Description('Command key used in the spec map (e.g. turbo-fan).')
    @Example('turbo-fan')
    public key: string;

    @Required()
    @Property(Number)
    @Description('Service instance ID (siid).')
    public siid: number;

    @Required()
    @Property(Number)
    @Description('Property instance ID (piid).')
    public piid: number;

    @Required()
    @Enum(PropertyAccess)
    @CollectionOf(PropertyAccess)
    @Description('Access modes for the property.')
    public access: PropertyAccess[];

    @Required()
    @CollectionOf(MiotPropertyValue)
    @Description('Allowed values for this property.')
    public values: MiotPropertyValue[];
}
