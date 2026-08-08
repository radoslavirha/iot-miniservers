import { useMemo } from 'react';
import { createQrCodesClient, type QrCodesClient } from './qrCodes.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';
import { useReportApiOutcome } from '../runtime/ApiStatusContext.js';

/**
 * The client every page should use. Wiring config and outcome reporting here
 * keeps pages from each constructing their own client and forgetting one or
 * the other.
 */
export const useQrCodesClient = (): QrCodesClient => {
    const config = useRuntimeConfig();
    const report = useReportApiOutcome();

    return useMemo(
        () => createQrCodesClient(config.apiBaseURL, { onOutcome: report }),
        [config.apiBaseURL, report]
    );
};
