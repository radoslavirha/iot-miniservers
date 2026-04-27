import { createContext, useContext, type ReactNode } from 'react';
import type { RuntimeConfig } from './RuntimeConfig.js';

const RuntimeConfigContext = createContext<RuntimeConfig | null>(null);

export const RuntimeConfigProvider = ({ value, children }: { value: RuntimeConfig; children: ReactNode }) => (
    <RuntimeConfigContext.Provider value={value}>{children}</RuntimeConfigContext.Provider>
);

export const useRuntimeConfig = (): RuntimeConfig => {
    const value = useContext(RuntimeConfigContext);
    if (!value) {
        throw new Error('useRuntimeConfig called outside of <RuntimeConfigProvider>.');
    }
    return value;
};
