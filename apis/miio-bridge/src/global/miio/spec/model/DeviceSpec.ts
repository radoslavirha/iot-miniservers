import { AdditionalProperties, CollectionOf, Description, ForwardGroups, Groups, Property, Required } from '@tsed/schema';
import { MiotAction } from './MiotAction.js';
import { MiotProperty } from './MiotProperty.js';
import { GROUP_NEVER_SIMPLIFIED_SPEC } from '../../../Groups.js';

/**
 * MIoT Device Spec
 */
@Description('Parsed MIoT device specification with typed maps of properties and actions')
@AdditionalProperties(false)
export class DeviceSpec {
    @Required()
    @Property(String)
    @Description('Human-readable device name')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public name: string;

    @Required()
    @Property(String)
    @Description('Full MIoT spec type URN (e.g. urn:miot-spec-v2:device:vacuum:...')
    @Groups(GROUP_NEVER_SIMPLIFIED_SPEC)
    public type: string;

    @Required()
    @CollectionOf(MiotProperty)
    @Description('Map of properties keyed by service:property (e.g. vacuum:sweep-type)')
    @ForwardGroups()
    public properties: Map<string, MiotProperty>;

    @Required()
    @CollectionOf(MiotAction)
    @Description('Map of actions keyed by service:action (e.g. vacuum:start-sweep)')
    @ForwardGroups()
    public actions: Map<string, MiotAction>;
}
