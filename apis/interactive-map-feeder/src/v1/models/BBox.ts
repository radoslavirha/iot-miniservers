import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';
import { Coordinates } from './Coordinates.js';
import { CommonUtils } from '@radoslavirha/utils';

@Description('Bounding box model.')
@AdditionalProperties(false)
export class BBox {
    @Description('The top left coordinates.')
    @Required()
    @Property()
    @Example(CommonUtils.buildModel(Coordinates, {
        latitude: 52.167,
        longitude: 11.267
    }))
    public topLeft: Coordinates;

    @Description('The bottom right coordinates.')
    @Required()
    @Property()
    @Example(CommonUtils.buildModel(Coordinates, {
        latitude: 48.1,
        longitude: 20.770
    }))
    public bottomRight: Coordinates;
}