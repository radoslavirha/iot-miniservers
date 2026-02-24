import { AdditionalProperties, Description, Property, Required } from '@tsed/schema';

@AdditionalProperties(false)
export class MongoConfig {
    @Property(Boolean)
    @Required()
    @Description('Enable MongoDB as the device storage. When false, the local JSON file cache is used.')
    public enabled: boolean;
}
