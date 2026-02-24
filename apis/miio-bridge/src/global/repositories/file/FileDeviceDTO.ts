import { MiotSpec } from '../../miio/spec/index.js';

/**
 * JSON-on-disk shape for file-backed device cache.
 */
export interface FileDeviceDTO {
    deviceId: number;
    address: string;
    token: string;
    stamp: number;
    model: string;
    specURL: string;
    rawSpec: MiotSpec;
}
