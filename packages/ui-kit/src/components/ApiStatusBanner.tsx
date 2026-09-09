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

    const message = messageFor(status, serviceName);

    return <StatusBar status="error" message={message} />;
};

/**
 * One line per non-ok status.
 *
 * `unauthenticated` earns its own wording because the other two are about the
 * backend and this one is about the viewer: nothing is broken, nothing is
 * retrying, and waiting will not help. It says what to do instead.
 */
const messageFor = (status: Exclude<ApiStatus, 'ok'>, serviceName: string): string => {
    switch (status) {
        case 'unreachable':
            return `Cannot reach ${serviceName}.`;
        case 'unauthenticated':
            return `${serviceName} did not accept your session — sign in again.`;
        case 'degraded':
            return `${serviceName} is having problems — retrying.`;
    }
};
