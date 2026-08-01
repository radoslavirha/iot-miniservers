import '@radoslavirha/tsed-logger';
import { LoggerProviderLogMetadata } from '../global/providers/LoggerProviderLogMetadata.js';

declare module '@radoslavirha/tsed-logger' {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface LoggerMetadata extends LoggerProviderLogMetadata {}
}