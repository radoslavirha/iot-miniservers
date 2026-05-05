import { useEffect, useState } from 'react';
import type React from 'react';

export type StatusVariant = 'loading' | 'ok' | 'error';

export interface StatusBarProps {
    readonly status: StatusVariant;
    readonly message: string;
}

export const StatusBar = ({ status, message }: StatusBarProps): React.JSX.Element | null => {
    const [visible, setVisible] = useState(true);
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        setVisible(true);
        setOpacity(1);

        if (status !== 'ok') {
            return;
        }

        const fadeOut = setTimeout(() => { setOpacity(0); }, 4000);
        const hide = setTimeout(() => { setVisible(false); }, 4700);

        return () => {
            clearTimeout(fadeOut);
            clearTimeout(hide);
        };
    }, [status, message]);

    if (!visible) {
        return null;
    }

    return (
        <div
            className={`status-bar status-bar--${status}`}
            style={{ opacity, transition: 'opacity 0.7s' }}
        >
            <span className={`status-dot${status === 'loading' ? ' status-dot--pulse' : ''}`} />
            <span>{message}</span>
        </div>
    );
};
