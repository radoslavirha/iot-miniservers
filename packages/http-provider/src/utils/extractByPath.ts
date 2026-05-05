import { ObjectUtils } from '@radoslavirha/utils';

/**
 * Extracts a value from an object by dot-notation path.
 * The path is relative to the object itself (not `response.data`).
 *
 * @example
 * extractByPath({ access_token: 'abc' }, 'access_token') // 'abc'
 * extractByPath({ data: { token: 'abc' } }, 'data.token') // 'abc'
 */
export function extractByPath(obj: unknown, path: string): string {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (!ObjectUtils.isObject(current)) {
            throw new Error(`Cannot extract path "${path}": "${part}" is not an object`);
        }
        current = (current as Record<string, unknown>)[part];
    }
    if (typeof current !== 'string') {
        throw new Error(`Extracted value at path "${path}" is not a string (got ${typeof current})`);
    }
    return current;
}
