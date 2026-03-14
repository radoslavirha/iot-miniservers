import { AdditionalProperties, CollectionOf, Description, Enum, Example, Property, Required } from '@tsed/schema';
import { MiotPropertyValue } from '../simplified-miot-spec/MiotPropertyValue.js';
import { PropertyAccess } from '../simplified-miot-spec/PropertyAccess.enum.js';

@Description('Request model for creating a custom (undocumented) device property.')
@AdditionalProperties(false)
export class ModelPropertyOverrideRequest {
    @Required()
    @Property(String)
    @Description('Device model identifier.')
    @Example('xiaomi.vacuum.c102gl')
    public model: string;

    @Required()
    @Property(String)
    @Description('Command key to use in the spec map (e.g. turbo-fan).')
    @Example('turbo-fan')
    public key: string;

    @Required()
    @Property(Number)
    @Description('Service instance ID (siid).')
    @Example(2)
    public siid: number;

    @Required()
    @Property(Number)
    @Description('Property instance ID (piid).')
    @Example(4)
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
