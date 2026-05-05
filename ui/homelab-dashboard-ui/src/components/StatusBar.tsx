import { useEffect, useState } from 'react';

interface Props {
    state: 'loading' | 'ok' | 'error';
    message: string;
}

export function StatusBar({ state, message }: Props) {
    const [visible, setVisible] = useState(true);
    const [opacity, setOpacity] = useState(1);

    useEffect(() => {
        setVisible(true);
        setOpacity(1);

        if (state === 'ok') {
            const fadeOut = setTimeout(() => setOpacity(0), 4000);
            const hide = setTimeout(() => setVisible(false), 4700);
            return () => {
                clearTimeout(fadeOut);
                clearTimeout(hide);
            };
        }
    }, [state, message]);

    if (!visible) return null;

    return (
        <div className={`status-bar ${state}`} style={{ opacity, transition: 'opacity 0.7s' }}>
            <span className={`status-dot${state === 'loading' ? ' pulse' : ''}`} />
            <span>{message}</span>
        </div>
    );
}
