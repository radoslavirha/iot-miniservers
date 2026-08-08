/**
 * Node-side entry point, run by the validating initContainer.
 *
 * Kept out of the main entry so browser bundles never see `node:fs`, and so
 * consumers of the browser entry do not need Node type definitions.
 */
export { validateConfigFile } from './config/validateConfigFile.js';
export { runConfigValidatorCli } from './config/cli.js';

export type { ValidateConfigFileResult } from './config/validateConfigFile.js';
