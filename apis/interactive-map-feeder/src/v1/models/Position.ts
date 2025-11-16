import { AdditionalProperties, Description, Example, Property, Required } from '@tsed/schema';

@Description('A simple model representing x,y coordinates on e.g. image.')
@AdditionalProperties(false)
export class Position {
    @Description('The x position.')
    @Required()
    @Property()
    @Example(10)
    public x: number;
    
    @Description('The y position.')
    @Required()
    @Property()
    @Example(5)
    public y: number;
}