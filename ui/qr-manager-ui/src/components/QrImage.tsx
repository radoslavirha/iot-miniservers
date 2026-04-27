import type { QrCode } from '../api/types.js';

interface Props {
    qrCode: QrCode;
    /** Display size in CSS pixels. SVG scales freely; default tuned for visualisation. */
    displaySize?: number;
    /** PNG download size in pixels. 1024 = ~26mm at Prusa MK4S 0.4mm nozzle resolution. */
    downloadSize?: number;
}

export const QrImage = ({ qrCode, displaySize = 320, downloadSize = 1024 }: Props) => (
    <figure className="qr-image">
        <img
            src={`${qrCode.imageURL}?format=svg`}
            alt={`QR code for ${qrCode.label}`}
            width={displaySize}
            height={displaySize}
        />
        <figcaption>
            <a href={qrCode.qrURL}>{qrCode.qrURL}</a>
        </figcaption>
        <div className="qr-image-downloads">
            <a href={`${qrCode.imageURL}?format=svg`} download={`${qrCode.slug}.svg`}>
                Download SVG (vector — best for print)
            </a>
            <a href={`${qrCode.imageURL}?format=png&size=${downloadSize}`} download={`${qrCode.slug}.png`}>
                Download PNG ({downloadSize}px)
            </a>
        </div>
    </figure>
);
