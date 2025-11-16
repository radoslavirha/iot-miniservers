import { defaultConfig } from '@radoslavirha/config-vitest';
import { defineConfig } from 'vitest/config';

const config = { ...defaultConfig };
config.test?.coverage?.exclude?.push('src/models/**');

export default defineConfig(config);