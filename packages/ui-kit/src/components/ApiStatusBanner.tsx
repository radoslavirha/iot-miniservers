import type React from 'react';
import type { ApiStatus } from '@radoslavirha/ui-runtime';
import { StatusBar } from './StatusBar.js';

export interface ApiStatusBannerProps {
    readonly status: ApiStatus;
    /** Human name of the backend, e.g. "QR Manager API". Never a URL. */
    readonly serviceName: string;
}

/**
 * Surfaces a degraded backend once, at the top of the app, instead of leaving
 * every page to render its own raw fetch error.
 *
 * Deliberately says nothing about URLs, status codes or response bodies: this
 * text ends up on a screen someone may photograph, and on an unattended wall
 * display. Detail belongs in the console and in Loki.
 */
export const ApiStatusBanner = ({ status, serviceName }: ApiStatusBannerProps): React.JSX.Element | null => {
    if (status === 'ok') {
        return null;
    }

    const message = status === 'unreachable'
        ? `Cannot reach ${serviceName}.`
        : `${serviceName} is having problems — retrying.`;

    return <StatusBar status="error" message={message} />;
};
