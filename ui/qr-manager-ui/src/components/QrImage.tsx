import type { QrCode } from '../api/types.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';

interface Props {
    qrCode: QrCode;
    /** Display size in CSS pixels. SVG scales freely; default tuned for visualisation. */
    displaySize?: number;
    /** PNG download size in pixels. 1024 = ~26mm at Prusa MK4S 0.4mm nozzle resolution. */
    downloadSize?: number;
}

export const QrImage = ({ qrCode, displaySize = 320, downloadSize = 1024 }: Props) => {
    const { apiBaseURL } = useRuntimeConfig();
    const imageBase = `${apiBaseURL}/qr-codes/${qrCode.id}/image`;

    return (
        <figure className="qr-image">
            <img
                src={`${imageBase}?format=svg`}
                alt={`QR code for ${qrCode.label}`}
                width={displaySize}
                height={displaySize}
            />
            <figcaption>
                <a href={qrCode.qrURL}>{qrCode.qrURL}</a>
            </figcaption>
            <div className="qr-image-downloads">
                <a href={`${imageBase}?format=svg`} download={`${qrCode.slug}.svg`}>
                    Download SVG (vector — best for print)
                </a>
                <a href={`${imageBase}?format=png&size=${downloadSize}`} download={`${qrCode.slug}.png`}>
                    Download PNG ({downloadSize}px)
                </a>
            </div>
        </figure>
    );
};
