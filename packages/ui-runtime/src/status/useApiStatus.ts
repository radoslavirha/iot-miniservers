import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiStatus, RequestOutcome } from './ApiStatus.js';
import { statusForOutcome } from './ApiStatus.js';

export interface RecoveryProbeOptions {
    /** Resolves true when the backend answers again. Errors count as false. */
    readonly probe: () => Promise<boolean>;
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
}

export interface UseApiStatusOptions {
    /**
     * Report `unreachable` while the browser is offline, so a dropped Wi-Fi
     * connection is not blamed on the backend.
     */
    readonly onlineAware?: boolean;
    /**
     * Opt-in recovery polling. Runs ONLY while status is not 'ok', backs off,
     * and stops on the first success. Intended for unattended screens where
     * nobody is present to reload; a hands-on admin UI should leave it unset.
     */
    readonly recoveryProbe?: RecoveryProbeOptions;
}

export interface UseApiStatusResult {
    readonly status: ApiStatus;
    /** Call after every request the app makes. */
    readonly report: (outcome: RequestOutcome) => void;
}

const DEFAULT_INITIAL_DELAY_MS = 2_000;
const DEFAULT_MAX_DELAY_MS = 60_000;

export const useApiStatus = (options: UseApiStatusOptions = {}): UseApiStatusResult => {
    const { onlineAware = true, recoveryProbe } = options;
    const [status, setStatus] = useState<ApiStatus>('ok');

    const report = useCallback((outcome: RequestOutcome) => {
        setStatus(statusForOutcome(outcome));
    }, []);

    useEffect(() => {
        if (!onlineAware || typeof window === 'undefined') {
            return;
        }
        const goOffline = () => {
            setStatus('unreachable'); 
        };
        const goOnline = () => {
            setStatus('ok'); 
        };
        window.addEventListener('offline', goOffline);
        window.addEventListener('online', goOnline);
        return () => {
            window.removeEventListener('offline', goOffline);
            window.removeEventListener('online', goOnline);
        };
    }, [onlineAware]);

    // Keep the latest probe without making it a dependency — a caller passing an
    // inline object must not restart the backoff on every render.
    const probeRef = useRef(recoveryProbe);
    probeRef.current = recoveryProbe;

    useEffect(() => {
        if (status === 'ok' || !probeRef.current) {
            return;
        }

        const { initialDelayMs = DEFAULT_INITIAL_DELAY_MS, maxDelayMs = DEFAULT_MAX_DELAY_MS } = probeRef.current;
        let cancelled = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let delay = initialDelayMs;

        const attempt = async () => {
            // A hidden tab has no user to serve; polling it is pure waste.
            if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
                schedule();
                return;
            }
            let recovered = false;
            try {
                recovered = await (probeRef.current?.probe() ?? Promise.resolve(false));
            } catch {
                recovered = false;
            }
            if (cancelled) {
                return;
            }
            if (recovered) {
                setStatus('ok');
                return;
            }
            delay = Math.min(delay * 2, maxDelayMs);
            schedule();
        };

        const schedule = () => {
            if (!cancelled) {
                timer = setTimeout(() => {
                    void attempt(); 
                }, delay);
            }
        };

        schedule();

        return () => {
            cancelled = true;
            if (timer !== undefined) {
                clearTimeout(timer);
            }
        };
    }, [status]);

    return { status, report };
};
