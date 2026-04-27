/**
 * QR error correction level — controls how much of the symbol can be damaged
 * before scanning fails. Higher levels add redundancy = more modules = bigger
 * physical print. For protected indoor labels `M` is plenty.
 *
 * | Level | Damage tolerance | Module count for ~30-char URL |
 * |-------|------------------|-------------------------------|
 * | L     | ~7%              | smallest (V2 / 25x25)         |
 * | M     | ~15%             | small (V3 / 29x29)            |
 * | Q     | ~25%             | medium (V3 / 29x29)           |
 * | H     | ~30%             | largest (V4 / 33x33)          |
 */
export enum QrErrorCorrection {
    L = 'L',
    M = 'M',
    Q = 'Q',
    H = 'H'
}
