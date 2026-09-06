import { useMemo } from 'react';
import { useAuth } from '@radoslavirha/ui-auth';
import { createQrCodesClient, type QrCodesClient } from './qrCodes.js';
import { useRuntimeConfig } from '../runtime/RuntimeConfigContext.js';
import { useReportApiOutcome } from '../runtime/ApiStatusContext.js';

/**
 * The client every page should use. Wiring config, outcome reporting and the
 * access token here keeps pages from each constructing their own client and
 * forgetting one of the three.
 *
 * The token is handed over as a getter rather than a value: the client reads it
 * per request, so the memoised client keeps working across a token change
 * without every page having to re-run its effect.
 *
 * It is passed to THIS client only. The token is minted for qr-manager-api and
 * must not reach a third party, which is why nothing here touches global
 * `fetch`.
 */
export const useQrCodesClient = (): QrCodesClient => {
    const config = useRuntimeConfig();
    const report = useReportApiOutcome();
    const { getAccessToken } = useAuth();

    return useMemo(
        () => createQrCodesClient(config.apiBaseURL, { onOutcome: report, getAccessToken }),
        [config.apiBaseURL, report, getAccessToken]
    );
};
