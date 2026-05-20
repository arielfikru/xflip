import { parseChunks } from '@xflip/core';

/**
 * Summary of a single parsed chunk produced by {@link inspect}.
 */
export interface ChunkSummary {
  readonly type: string;
  readonly offset: number;
  readonly length: number;
  readonly critical: boolean;
}

/**
 * Result of {@link inspect}.
 */
export interface InspectResult {
  readonly bytes: number;
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly chunks: readonly ChunkSummary[];
}

export interface InspectOptions {
  /** Treat ancillary CRC mismatches as fatal. Defaults to spec lenient mode. */
  readonly strictAncillaryCrc?: boolean;
}

/**
 * Parse an xflip buffer and return a structural summary suitable for
 * human-readable printing. Validates the signature and every CRC; throws
 * {@link XflipError} on malformed input.
 *
 * @example
 * ```ts
 * import { readFile } from 'node:fs/promises';
 * const summary = inspect(await readFile('card.xflip'));
 * console.log(summary.chunks);
 * ```
 */
export function inspect(bytes: Uint8Array, options: InspectOptions = {}): InspectResult {
  const parsed = parseChunks(bytes, options);
  return {
    bytes: bytes.byteLength,
    versionMajor: parsed.versionMajor,
    versionMinor: parsed.versionMinor,
    chunks: parsed.chunks.map((c) => ({
      type: c.type,
      offset: c.offset,
      length: c.payload.byteLength,
      critical: c.critical,
    })),
  };
}

/**
 * Render an {@link InspectResult} as a stable, line-oriented report.
 * Designed for terminal output; not part of any binary-format contract.
 */
export function formatInspectReport(result: InspectResult, path: string): string {
  const header = [
    `xflip file: ${path}`,
    `  size:    ${result.bytes} bytes`,
    `  version: ${result.versionMajor}.${result.versionMinor}`,
    `  chunks:  ${result.chunks.length}`,
  ];
  const tableHeader = '  TYPE  OFFSET     LENGTH  CRITICAL';
  const rows = result.chunks.map((c) => {
    const offset = String(c.offset).padStart(8);
    const length = String(c.length).padStart(8);
    const flag = c.critical ? 'yes' : 'no';
    return `  ${c.type}  ${offset}  ${length}  ${flag}`;
  });
  return [...header, '', tableHeader, ...rows].join('\n');
}
