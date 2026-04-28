export const QR_TYPES = ['iot-device', 'plant', 'other'] as const;
export type QrType = typeof QR_TYPES[number];

export interface QrCode {
    id: string;
    slug: string;
    targetURL: string;
    label: string;
    type: QrType;
    active: boolean;
    qrURL: string;
    createdAt: string;
    updatedAt: string;
}

export interface QrCodeListResponse {
    items: QrCode[];
}

export interface QrCodeCreateRequest {
    targetURL: string;
    label: string;
    type: QrType;
}

export interface QrCodeUpdateRequest {
    targetURL?: string;
    label?: string;
    type?: QrType;
    active?: boolean;
}

export interface QrCodeListFilter {
    type?: QrType;
    active?: boolean;
}
