import { defaultConfig } from '@radoslavirha/config-vitest';
import { ObjectUtils } from '@radoslavirha/utils';
import { defineConfig } from 'vitest/config';

export default defineConfig(ObjectUtils.mergeDeep(defaultConfig, {
    test: {
        coverage: {
            exclude: ['src/models/**']
        }
    }
}));