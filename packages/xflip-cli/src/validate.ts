import { decode, type ParseOptions, XflipError } from '@xflip/core';

/**
 * Result of {@link validate}.
 *
 * `valid` is `true` only if the file decodes cleanly under the full v1.x
 * decoder, which checks signature, every CRC, chunk order, mandatory
 * chunks, HEAD payload shape, and known ancillary parse contracts.
 */
export type ValidateResult =
  | {
      readonly valid: true;
      readonly bytes: number;
      readonly versionMajor: number;
      readonly versionMinor: number;
    }
  | {
      readonly valid: false;
      readonly bytes: number;
      readonly errorName: string;
      readonly message: string;
    };

export interface ValidateOptions extends ParseOptions {}

/**
 * Validate an xflip buffer end-to-end. Never throws on input that is
 * merely malformed — only on programmer error (non-Uint8Array, etc.).
 *
 * @example
 * ```ts
 * import { readFile } from 'node:fs/promises';
 * import { validate } from '@xflip/cli';
 *
 * const result = validate(await readFile('card.xflip'));
 * if (!result.valid) console.error(result.message);
 * ```
 */
export function validate(bytes: Uint8Array, options: ValidateOptions = {}): ValidateResult {
  try {
    const file = decode(bytes, options);
    return {
      valid: true,
      bytes: bytes.byteLength,
      versionMajor: file.versionMajor,
      versionMinor: file.versionMinor,
    };
  } catch (err) {
    if (err instanceof XflipError) {
      return {
        valid: false,
        bytes: bytes.byteLength,
        errorName: err.name,
        message: err.message,
      };
    }
    throw err;
  }
}

/**
 * Render a {@link ValidateResult} as a stable, line-oriented report.
 */
export function formatValidateReport(result: ValidateResult, path: string): string {
  if (result.valid) {
    return `OK  ${path}  (xflip ${result.versionMajor}.${result.versionMinor}, ${result.bytes} bytes)`;
  }
  return [
    `FAIL  ${path}  (${result.bytes} bytes)`,
    `  ${result.errorName}: ${result.message}`,
  ].join('\n');
}
