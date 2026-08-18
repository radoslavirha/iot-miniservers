export const HEADER_SIZE = 32;
export const MAGIC = 0x2131;

/**
 * Default UDP port every miot device listens on.
 *
 * Exported because a caller that traces or firewalls these calls needs the port it will
 * actually reach, and `MiotDeviceOptions.port` is optional — hardcoding 54321 a second time in
 * an app is how a span ends up claiming a port the transport never used.
 */
export const MIOT_DEFAULT_PORT = 54321;