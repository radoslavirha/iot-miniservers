import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QrImage } from './QrImage.js';
import type { QrCode } from '../api/types.js';

const API_BASE = 'https://api.server.home/qr';
const IMAGE_BASE = `${API_BASE}/qr-codes/id1/image`;

const sample: QrCode = {
    id: 'id1',
    slug: 'x7k2',
    targetURL: 'https://iot-ui.home/devices/shelf-1',
    label: 'Shelf 1',
    type: 'iot-device',
    active: true,
    qrURL: 'https://qr.home/x7k2',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z'
};

describe('<QrImage />', () => {
    it('constructs image URLs from apiBaseURL prop', () => {
        render(<QrImage qrCode={sample} apiBaseURL={API_BASE} />);
        const img = screen.getByRole('img', { name: /Shelf 1/i });
        expect(img).toHaveAttribute('src', `${IMAGE_BASE}?format=svg`);
        expect(img).toHaveAttribute('width', '320');

        const svg = screen.getByText(/Download SVG/).closest('a');
        expect(svg).toHaveAttribute('href', `${IMAGE_BASE}?format=svg`);
        expect(svg).toHaveAttribute('download', 'x7k2.svg');

        const png = screen.getByText(/Download PNG/).closest('a');
        expect(png).toHaveAttribute('href', `${IMAGE_BASE}?format=png&size=1024`);
        expect(png).toHaveAttribute('download', 'x7k2.png');
    });

    it('honours custom displaySize and downloadSize props', () => {
        render(<QrImage qrCode={sample} apiBaseURL={API_BASE} displaySize={512} downloadSize={2048} />);
        const img = screen.getByRole('img', { name: /Shelf 1/i });
        expect(img).toHaveAttribute('width', '512');
        const png = screen.getByText(/Download PNG/).closest('a');
        expect(png).toHaveAttribute('href', `${IMAGE_BASE}?format=png&size=2048`);
    });
});
