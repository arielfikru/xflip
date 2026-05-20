import { decode, type ImageFormat, type ParseOptions } from '@xflip/core';

const FORMAT_EXTENSIONS: Record<ImageFormat, string> = {
  png: 'png',
  jpeg: 'jpg',
  webp: 'webp',
  avif: 'avif',
  jxl: 'jxl',
  raw: 'bin',
  custom: 'bin',
};

/**
 * One file the extractor wants written to disk.
 */
export interface ExtractedFile {
  /** Relative filename (no path). */
  readonly filename: string;
  /** Bytes to write verbatim. */
  readonly bytes: Uint8Array;
}

/**
 * Result of {@link extract}: a deterministic, in-memory listing of the
 * files the CLI should materialize. The CLI is responsible for actual
 * filesystem I/O so this stays pure and unit-testable.
 */
export interface ExtractResult {
  readonly versionMajor: number;
  readonly versionMinor: number;
  readonly front: ExtractedFile;
  readonly back: ExtractedFile;
  /** Present if a `META` ancillary chunk was found in the source file. */
  readonly meta?: ExtractedFile;
}

export interface ExtractOptions extends ParseOptions {}

/**
 * Decode an xflip buffer and return the files an extractor should write:
 * `front.<ext>`, `back.<ext>`, and (if present) `meta.json`. The
 * extensions are derived from the HEAD image-format codes; `raw` and
 * `custom` both map to `.bin`. Throws {@link XflipError} on malformed
 * input — the CLI catches and reports.
 *
 * @example
 * ```ts
 * const plan = extract(await readFile('card.xflip'));
 * await writeFile(`out/${plan.front.filename}`, plan.front.bytes);
 * ```
 */
export function extract(bytes: Uint8Array, options: ExtractOptions = {}): ExtractResult {
  const file = decode(bytes, options);
  const front: ExtractedFile = {
    filename: `front.${FORMAT_EXTENSIONS[file.head.frontFormat]}`,
    bytes: file.front,
  };
  const back: ExtractedFile = {
    filename: `back.${FORMAT_EXTENSIONS[file.head.backFormat]}`,
    bytes: file.back,
  };
  const metaBytes = file.ancillary?.get('META');
  const meta: ExtractedFile | undefined =
    metaBytes === undefined ? undefined : { filename: 'meta.json', bytes: metaBytes };

  return meta === undefined
    ? { versionMajor: file.versionMajor, versionMinor: file.versionMinor, front, back }
    : { versionMajor: file.versionMajor, versionMinor: file.versionMinor, front, back, meta };
}

/**
 * Render an {@link ExtractResult} as a stable, line-oriented report of
 * which files were extracted and to what directory.
 */
export function formatExtractReport(result: ExtractResult, directory: string): string {
  const lines = [
    `Extracted xflip ${result.versionMajor}.${result.versionMinor} → ${directory}`,
    `  ${result.front.filename}  (${result.front.bytes.byteLength} bytes)`,
    `  ${result.back.filename}  (${result.back.bytes.byteLength} bytes)`,
  ];
  if (result.meta !== undefined) {
    lines.push(`  ${result.meta.filename}  (${result.meta.bytes.byteLength} bytes)`);
  }
  return lines.join('\n');
}
