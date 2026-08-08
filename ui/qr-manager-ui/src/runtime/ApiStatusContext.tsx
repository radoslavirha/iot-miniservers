import { createContext, useContext, type ReactNode } from 'react';
import type { RequestOutcome } from '@radoslavirha/ui-runtime';

/**
 * Lets any page report the outcome of a real request without threading a
 * callback through props. The app derives its view of the backend from the
 * requests it already makes — it does not poll a health endpoint.
 */
const ApiStatusContext = createContext<((outcome: RequestOutcome) => void) | null>(null);

export const ApiStatusProvider = (
    { report, children }: { report: (outcome: RequestOutcome) => void; children: ReactNode }
) => (
    <ApiStatusContext.Provider value={report}>{children}</ApiStatusContext.Provider>
);

export const useReportApiOutcome = (): ((outcome: RequestOutcome) => void) => {
    const report = useContext(ApiStatusContext);
    if (!report) {
        throw new Error('useReportApiOutcome called outside of <ApiStatusProvider>.');
    }
    return report;
};
