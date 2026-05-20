/**
 * `@xflip/cli` — Node CLI for the xflip image format.
 *
 * The library entry exposes command implementations for programmatic use
 * and testing. The executable entry is `cli.ts`, installed as `xflip` via
 * the package's `bin` field.
 *
 * @packageDocumentation
 */

export type { ChunkSummary, InspectOptions, InspectResult } from './inspect.js';
export { inspect } from './inspect.js';
export type { ValidateOptions, ValidateResult } from './validate.js';
export { validate } from './validate.js';
