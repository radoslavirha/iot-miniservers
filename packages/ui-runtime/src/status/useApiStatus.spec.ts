import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useApiStatus } from './useApiStatus.js';
import { classifyError, classifyResponse } from './classifyResponse.js';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('useApiStatus', () => {
    it('starts ok', () => {
        const { result } = renderHook(() => useApiStatus());

        expect(result.current.status).toBe('ok');
    });

    it('goes degraded on a 5xx', () => {
        const { result } = renderHook(() => useApiStatus());

        act(() => {
            result.current.report(classifyResponse({ status: 503 })); 
        });

        expect(result.current.status).toBe('degraded');
    });

    it('stays ok on a 4xx — the API answered, the request was wrong', () => {
        const { result } = renderHook(() => useApiStatus());

        act(() => {
            result.current.report(classifyResponse({ status: 422 })); 
        });

        expect(result.current.status).toBe('ok');
    });

    it('goes unreachable when the request never completes', () => {
        const { result } = renderHook(() => useApiStatus());

        act(() => {
            result.current.report(classifyError()); 
        });

        expect(result.current.status).toBe('unreachable');
    });

    it('recovers on the next success', () => {
        const { result } = renderHook(() => useApiStatus());

        act(() => {
            result.current.report(classifyError()); 
        });
        act(() => {
            result.current.report(classifyResponse({ status: 200 })); 
        });

        expect(result.current.status).toBe('ok');
    });

    it('reports unreachable while the browser is offline', () => {
        const { result } = renderHook(() => useApiStatus());

        act(() => {
            window.dispatchEvent(new Event('offline')); 
        });

        expect(result.current.status).toBe('unreachable');
    });

    it('does not run the recovery probe while ok', () => {
        const probe = vi.fn().mockResolvedValue(true);
        renderHook(() => useApiStatus({ recoveryProbe: { probe } }));

        act(() => {
            vi.advanceTimersByTime(60_000); 
        });

        expect(probe).not.toHaveBeenCalled();
    });

    it('polls with backoff while degraded and stops on recovery', async () => {
        const probe = vi.fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValueOnce(true);
        const { result } = renderHook(() =>
            useApiStatus({ recoveryProbe: { probe, initialDelayMs: 1_000 } }));

        act(() => {
            result.current.report(classifyError()); 
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000); 
        });
        expect(probe).toHaveBeenCalledTimes(1);

        // Backed off: nothing at +1000, the second attempt lands at +2000.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000); 
        });
        expect(probe).toHaveBeenCalledTimes(1);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000); 
        });
        expect(probe).toHaveBeenCalledTimes(2);
        expect(result.current.status).toBe('ok');

        // Recovered, so polling stops — no further calls however long we wait.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000); 
        });
        expect(probe).toHaveBeenCalledTimes(2);
    });

    it('treats a throwing probe as not-yet-recovered', async () => {
        const probe = vi.fn().mockRejectedValue(new Error('still down'));
        const { result } = renderHook(() =>
            useApiStatus({ recoveryProbe: { probe, initialDelayMs: 1_000 } }));

        act(() => {
            result.current.report(classifyError()); 
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000); 
        });

        expect(result.current.status).toBe('unreachable');
    });

    it('stops polling on unmount', async () => {
        const probe = vi.fn().mockResolvedValue(false);
        const { result, unmount } = renderHook(() =>
            useApiStatus({ recoveryProbe: { probe, initialDelayMs: 1_000 } }));

        act(() => {
            result.current.report(classifyError()); 
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1_000); 
        });
        const callsBefore = probe.mock.calls.length;

        unmount();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000); 
        });

        expect(probe).toHaveBeenCalledTimes(callsBefore);
    });
});
