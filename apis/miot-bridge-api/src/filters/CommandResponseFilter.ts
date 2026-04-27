import { ResponseFilter } from '@tsed/platform-response-filter';
import type { ResponseFilterMethods } from '@tsed/platform-response-filter';
import { CommonUtils, ObjectUtils } from '@radoslavirha/utils';

/**
 * Transforms CommandValueResponse into plain text for `text/plain` consumers.
 * Returns the value as a string, or an empty string when the value is undefined.
 */
@ResponseFilter('text/plain')
export class CommandResponseFilter implements ResponseFilterMethods {
    public transform(data: Record<string, unknown>): string {
        if (!ObjectUtils.isPlainObject(data)) {
            return '';
        }

        if (CommonUtils.notNil(data.value)) {
            return String(data.value);
        }

        return '';
    }
}
