import {
  encode,
  type FlipAxis,
  IMAGE_FORMAT_CODES,
  type ImageFormat,
  type XflipFile,
  type XflipHead,
} from '@xflip/core';

const IMAGE_FORMATS = Object.keys(IMAGE_FORMAT_CODES) as readonly ImageFormat[];

const EXTENSION_TO_FORMAT: Record<string, ImageFormat> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  avif: 'avif',
  jxl: 'jxl',
  bin: 'raw',
  raw: 'raw',
};

const FLIP_AXES: readonly FlipAxis[] = ['horizontal', 'vertical', 'diagonal'];

/**
 * Infer an {@link ImageFormat} from a filename's extension. Lowercased.
 * Returns `undefined` for extensions outside the registered set; callers
 * must require an explicit `--front-format` / `--back-format` override.
 */
export function formatFromExtension(filename: string): ImageFormat | undefined {
  const idx = filename.lastIndexOf('.');
  if (idx < 0 || idx === filename.length - 1) return undefined;
  const ext = filename.slice(idx + 1).toLowerCase();
  return EXTENSION_TO_FORMAT[ext];
}

export function isImageFormat(value: string): value is ImageFormat {
  return (IMAGE_FORMATS as readonly string[]).includes(value);
}

export function isFlipAxis(value: string): value is FlipAxis {
  return (FLIP_AXES as readonly string[]).includes(value);
}

/**
 * Inputs to {@link buildFile}. All bytes are caller-supplied; this module
 * never touches the filesystem so it stays pure and unit-testable.
 */
export interface CreateInputs {
  readonly front: Uint8Array;
  readonly back: Uint8Array;
  readonly frontFormat: ImageFormat;
  readonly backFormat: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly flipAxis?: FlipAxis;
  readonly defaultBack?: boolean;
  readonly noFlipAnim?: boolean;
  /** UTF-8 bytes for a META ancillary chunk; omit to skip META. */
  readonly meta?: Uint8Array;
}

/**
 * Assemble a v1.0 {@link XflipFile} and serialize it to bytes. Throws
 * `XflipEncodeError` from `@xflip/core` if HEAD inputs are out of range.
 */
export function buildFile(inputs: CreateInputs): Uint8Array {
  const head: XflipHead = {
    width: inputs.width,
    height: inputs.height,
    frontFormat: inputs.frontFormat,
    backFormat: inputs.backFormat,
    flipAxis: inputs.flipAxis ?? 'horizontal',
    flags: (inputs.defaultBack === true ? 0x01 : 0) | (inputs.noFlipAnim === true ? 0x02 : 0),
  };
  const file: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head,
    front: inputs.front,
    back: inputs.back,
    ...(inputs.meta !== undefined ? { ancillary: new Map([['META', inputs.meta]]) } : {}),
  };
  return encode(file);
}
