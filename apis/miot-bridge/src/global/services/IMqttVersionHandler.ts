import type { APIVersion } from '../models/APIVersion.enum.js';

export interface IMqttVersionHandler {
    /** API version this handler is responsible for. */
    readonly version: APIVersion;
    handle(payload: Buffer): Promise<string>;
}
