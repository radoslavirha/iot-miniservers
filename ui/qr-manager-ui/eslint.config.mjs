import { config } from 'typescript-eslint';
import Config from '@radoslavirha/config-eslint';

export default config(
    // Generated, minified validator bundle. Deliberately NOT under dist/ —
    // dist/ is copied to the nginx html root and would serve it publicly.
    { ignores: ['dist-validator/**'] },
    ...Config
);
