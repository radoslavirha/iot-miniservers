import { AdditionalProperties, Default, Description, Property, Required } from '@tsed/schema';

/**
 * Device property polling configuration.
 * The poller reads all subscribed properties for each device at a fixed interval
 * and emits change events consumed by the notification dispatch pipeline.
 */
@AdditionalProperties(false)
export class PollingConfig {
    @Required()
    @Property(Boolean)
    @Description('Whether background device property polling is enabled.')
    public enabled: boolean;

    @Required()
    @Property(Number)
    @Default(15000)
    @Description('Polling interval in milliseconds. Default: 15000.')
    public intervalMs: number;

    @Required()
    @Property(Boolean)
    @Default(true)
    @Description('When true, a notification is dispatched only when a property value changes. When false, dispatched on every cycle.')
    public dispatchOnChange: boolean;

    @Required()
    @Property(Number)
    @Default(3)
    @Description('Number of consecutive device errors before the device is placed in back-off.')
    public maxErrorCount: number;

    @Required()
    @Property(Number)
    @Default(20)
    @Description('Number of polling cycles to skip for a device after it reaches maxErrorCount consecutive errors.')
    public errorSkipCycles: number;
}
