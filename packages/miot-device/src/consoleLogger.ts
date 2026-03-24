import type { ILogger } from './types.js';

export const CONSOLE_LOGGER: ILogger = {
    trace: (...args) => {
        console.trace(...args);
    },
    debug: (...args) => {
        console.debug(...args);
    },
    info: (...args) => {
        console.info(...args);
    },
    warn: (...args) => {
        console.warn(...args);
    },
    error: (...args) => {
        console.error(...args);
    },
    fatal: (...args) => {
        console.error(...args);
    }
};
