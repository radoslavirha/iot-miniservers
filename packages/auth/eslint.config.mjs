import { config } from 'typescript-eslint';
import Config from '@radoslavirha/config-eslint';
import PreferUtils from '@radoslavirha/utils/eslint';

export default config(...Config, ...PreferUtils);
