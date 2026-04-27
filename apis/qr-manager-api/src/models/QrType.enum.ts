/**
 * Logical category of a QR code. Lets callers and the UI filter records by purpose.
 *
 * Add new members here as new consumer apps are onboarded — the enum is intentionally
 * open-ended. `OTHER` is the catch-all for anything that does not fit the named groups.
 */
export enum QrType {
    IOT_DEVICE = 'iot-device',
    PLANT = 'plant',
    OTHER = 'other'
}
