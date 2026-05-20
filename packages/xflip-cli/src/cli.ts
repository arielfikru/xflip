#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import {
  type BlendMode,
  decode,
  type FlipAxis,
  type ImageFormat,
  XflipError,
  type XflipLayerResponse,
} from '@xflip/core';
import { buildFile, formatFromExtension, isFlipAxis, isImageFormat } from './create.js';
import { extract, formatExtractReport } from './extract.js';
import { formatInspectReport, inspect } from './inspect.js';
import { addLayer, encodeWithLayer, isBlendMode, type LayerFace } from './layers.js';
import { formatValidateReport, validate } from './validate.js';

const PROGRAM = 'xflip';

const ROOT_HELP = `${PROGRAM} — command-line tool for the xflip image format

Usage:
  ${PROGRAM} <command> [options]

Commands:
  inspect <file>          Print chunk structure of an xflip file
  validate <file>         Verify CRC + structural validity (exit 1 if invalid)
  extract <file> --to D   Write FRNT/BACK (+ META) into directory D
  create --front A --back B --output O --width W --height H
                          Build an .xflip file from two images
  layers add <file> --face F --image I --effect-type E --output O
                          Add a layer to fLyr/bLyr (promotes v1.0 → v1.1)
  help [command]          Show help for a command

Run \`${PROGRAM} <command> --help\` for details.
`;

const INSPECT_HELP = `${PROGRAM} inspect <file>

Print the version, byte length, and per-chunk summary (type, source
offset, payload length, critical flag) of an .xflip file. Validates the
signature and every CRC; exits non-zero on malformed input.

Options:
      --strict-ancillary-crc   Treat ancillary CRC mismatches as fatal
  -h, --help                   Show this help text
`;

const CREATE_HELP = `${PROGRAM} create --front <a> --back <b> --output <out> --width <W> --height <H> [options]

Build an .xflip v1.0 file from two image inputs. Image formats are
inferred from each input's filename extension (png, jpg/jpeg, webp,
avif, jxl, bin/raw); use \`--front-format\` / \`--back-format\` to
override or to supply a format when the extension is unrecognized.

Options:
      --front <path>           Source image for the front face (required)
      --back <path>            Source image for the back face (required)
      --output <path>          Output .xflip path (required)
      --width <N>              Canvas width in pixels (required, 1..2^32-1)
      --height <N>             Canvas height in pixels (required, 1..2^32-1)
      --front-format <fmt>     Override inferred front format
      --back-format <fmt>      Override inferred back format
      --flip-axis <axis>       horizontal (default) | vertical | diagonal
      --default-back           Set DEFAULT_BACK HEAD flag (bit 0)
      --no-flip-anim           Set NO_FLIP_ANIM HEAD flag (bit 1)
      --meta <path>            Embed META chunk from a UTF-8 JSON file
      --force                  Overwrite an existing --output file
  -h, --help                   Show this help text
`;

const EXTRACT_HELP = `${PROGRAM} extract <file> --to <dir>

Decode an .xflip file and write its front image, back image, and (if
present) META payload into <dir>. Filenames are \`front.<ext>\`,
\`back.<ext>\` (extension derived from HEAD image-format code), and
\`meta.json\`. The target directory is created if missing. Refuses to
overwrite existing files unless \`--force\` is passed.

Options:
      --to <dir>               Target directory (required)
      --force                  Overwrite existing output files
      --strict-ancillary-crc   Treat ancillary CRC mismatches as fatal
  -h, --help                   Show this help text
`;

const VALIDATE_HELP = `${PROGRAM} validate <file>

Run the full decoder on an .xflip file. Checks signature, every CRC,
chunk order, mandatory chunks, HEAD payload shape, and known ancillary
parse contracts. Prints a one-line OK report on success, or a multi-line
FAIL report with the error class and message. Exit 0 valid, 1 invalid.

Options:
      --strict-ancillary-crc   Treat ancillary CRC mismatches as fatal
  -h, --help                   Show this help text
`;

const LAYERS_ADD_HELP = `${PROGRAM} layers add <file> --face <front|back> --image <path> --effect-type <name> --output <path> [options]

Insert a new layer into the file's \`fLyr\` (front) or \`bLyr\` (back)
chunk, creating the chunk when absent. If the input file is v1.0 and
had no layered chunks, the output is promoted to v1.1. The image format
is inferred from the \`--image\` extension; override with \`--format\`.

Options:
      --face <front|back>      Which face to add the layer to (required)
      --image <path>           Image bytes for the new layer (required)
      --effect-type <name>     Semantic effect type (required, e.g. holographic, x-custom)
      --output <path>          Output .xflip path (required; may equal <file> with --force)
      --format <fmt>           Override inferred image format
      --blend-mode <name>      Blend mode (default: normal)
      --layer-id <0-255>       Explicit layer_id; default = next unused
      --opacity <0-255>        Alpha multiplier (default 255)
      --z-order <0-255>        Stacking order (default = max + 1)
      --response <path>        UTF-8 JSON file for per-layer response parameters
      --force                  Overwrite an existing --output file
      --strict-ancillary-crc   Treat ancillary CRC mismatches as fatal while reading <file>
  -h, --help                   Show this help text
`;

export interface CliIo {
  readonly stdout: (line: string) => void;
  readonly stderr: (line: string) => void;
}

const defaultIo: CliIo = {
  stdout: (line) => process.stdout.write(`${line}\n`),
  stderr: (line) => process.stderr.write(`${line}\n`),
};

/**
 * Dispatch a single CLI invocation. Returns the process exit code without
 * calling `process.exit` itself so the function is unit-testable.
 *
 * @param argv - Argument list **excluding** `node` and the script name.
 *   Pass `process.argv.slice(2)` from a real entry point.
 */
export async function run(argv: readonly string[], io: CliIo = defaultIo): Promise<number> {
  const [command, ...rest] = argv;

  if (command === undefined || command === 'help') {
    const target = rest[0];
    if (target === 'inspect') {
      io.stdout(INSPECT_HELP);
    } else if (target === 'validate') {
      io.stdout(VALIDATE_HELP);
    } else if (target === 'extract') {
      io.stdout(EXTRACT_HELP);
    } else if (target === 'create') {
      io.stdout(CREATE_HELP);
    } else if (target === 'layers') {
      io.stdout(LAYERS_ADD_HELP);
    } else {
      io.stdout(ROOT_HELP);
    }
    return 0;
  }

  if (command === '--help' || command === '-h') {
    io.stdout(ROOT_HELP);
    return 0;
  }

  if (command === 'inspect') {
    return runInspect(rest, io);
  }

  if (command === 'validate') {
    return runValidate(rest, io);
  }

  if (command === 'extract') {
    return runExtract(rest, io);
  }

  if (command === 'create') {
    return runCreate(rest, io);
  }

  if (command === 'layers') {
    return runLayers(rest, io);
  }

  io.stderr(`${PROGRAM}: unknown command "${command}"`);
  io.stderr(`Run \`${PROGRAM} help\` for usage.`);
  return 2;
}

interface FileCommandArgs {
  readonly file: string;
  readonly strictAncillaryCrc: boolean;
}

type FileCommandResult =
  | { readonly kind: 'args'; readonly args: FileCommandArgs }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit'; readonly code: number };

function parseFileCommandArgs(
  argv: readonly string[],
  io: CliIo,
  subcommand: string,
): FileCommandResult {
  let values: { help?: boolean; 'strict-ancillary-crc'?: boolean };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h' },
        'strict-ancillary-crc': { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.stderr(`${PROGRAM} ${subcommand}: ${(err as Error).message}`);
    return { kind: 'exit', code: 2 };
  }

  if (values.help === true) {
    return { kind: 'help' };
  }

  const [file, ...extra] = positionals;
  if (file === undefined) {
    io.stderr(`${PROGRAM} ${subcommand}: missing <file> argument`);
    io.stderr(`Run \`${PROGRAM} help ${subcommand}\` for usage.`);
    return { kind: 'exit', code: 2 };
  }
  if (extra.length > 0) {
    io.stderr(`${PROGRAM} ${subcommand}: unexpected extra argument "${extra[0]}"`);
    return { kind: 'exit', code: 2 };
  }

  return {
    kind: 'args',
    args: { file, strictAncillaryCrc: values['strict-ancillary-crc'] === true },
  };
}

async function readFileOrReport(
  file: string,
  io: CliIo,
  subcommand: string,
): Promise<Uint8Array | number> {
  try {
    return await readFile(file);
  } catch (err) {
    io.stderr(`${PROGRAM} ${subcommand}: cannot read "${file}": ${(err as Error).message}`);
    return 1;
  }
}

async function runInspect(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseFileCommandArgs(argv, io, 'inspect');
  if (parsed.kind === 'help') {
    io.stdout(INSPECT_HELP);
    return 0;
  }
  if (parsed.kind === 'exit') {
    return parsed.code;
  }

  const bytes = await readFileOrReport(parsed.args.file, io, 'inspect');
  if (typeof bytes === 'number') return bytes;

  try {
    const result = inspect(bytes, { strictAncillaryCrc: parsed.args.strictAncillaryCrc });
    io.stdout(formatInspectReport(result, parsed.args.file));
    return 0;
  } catch (err) {
    if (err instanceof XflipError) {
      io.stderr(`${PROGRAM} inspect: ${err.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }
}

async function runValidate(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseFileCommandArgs(argv, io, 'validate');
  if (parsed.kind === 'help') {
    io.stdout(VALIDATE_HELP);
    return 0;
  }
  if (parsed.kind === 'exit') {
    return parsed.code;
  }

  const bytes = await readFileOrReport(parsed.args.file, io, 'validate');
  if (typeof bytes === 'number') return bytes;

  const result = validate(bytes, { strictAncillaryCrc: parsed.args.strictAncillaryCrc });
  if (result.valid) {
    io.stdout(formatValidateReport(result, parsed.args.file));
    return 0;
  }
  io.stderr(formatValidateReport(result, parsed.args.file));
  return 1;
}

interface ExtractCommandArgs {
  readonly file: string;
  readonly to: string;
  readonly force: boolean;
  readonly strictAncillaryCrc: boolean;
}

type ExtractParseResult =
  | { readonly kind: 'args'; readonly args: ExtractCommandArgs }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit'; readonly code: number };

function parseExtractArgs(argv: readonly string[], io: CliIo): ExtractParseResult {
  let values: {
    help?: boolean;
    to?: string;
    force?: boolean;
    'strict-ancillary-crc'?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h' },
        to: { type: 'string' },
        force: { type: 'boolean' },
        'strict-ancillary-crc': { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.stderr(`${PROGRAM} extract: ${(err as Error).message}`);
    return { kind: 'exit', code: 2 };
  }

  if (values.help === true) {
    return { kind: 'help' };
  }

  const [file, ...extra] = positionals;
  if (file === undefined) {
    io.stderr(`${PROGRAM} extract: missing <file> argument`);
    io.stderr(`Run \`${PROGRAM} help extract\` for usage.`);
    return { kind: 'exit', code: 2 };
  }
  if (extra.length > 0) {
    io.stderr(`${PROGRAM} extract: unexpected extra argument "${extra[0]}"`);
    return { kind: 'exit', code: 2 };
  }
  if (values.to === undefined || values.to === '') {
    io.stderr(`${PROGRAM} extract: missing required --to <dir>`);
    return { kind: 'exit', code: 2 };
  }

  return {
    kind: 'args',
    args: {
      file,
      to: values.to,
      force: values.force === true,
      strictAncillaryCrc: values['strict-ancillary-crc'] === true,
    },
  };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function runExtract(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseExtractArgs(argv, io);
  if (parsed.kind === 'help') {
    io.stdout(EXTRACT_HELP);
    return 0;
  }
  if (parsed.kind === 'exit') {
    return parsed.code;
  }

  const bytes = await readFileOrReport(parsed.args.file, io, 'extract');
  if (typeof bytes === 'number') return bytes;

  let plan: ReturnType<typeof extract>;
  try {
    plan = extract(bytes, { strictAncillaryCrc: parsed.args.strictAncillaryCrc });
  } catch (err) {
    if (err instanceof XflipError) {
      io.stderr(`${PROGRAM} extract: ${err.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }

  try {
    await mkdir(parsed.args.to, { recursive: true });
  } catch (err) {
    io.stderr(`${PROGRAM} extract: cannot create "${parsed.args.to}": ${(err as Error).message}`);
    return 1;
  }

  const files = [plan.front, plan.back, ...(plan.meta ? [plan.meta] : [])];
  if (!parsed.args.force) {
    for (const f of files) {
      const target = join(parsed.args.to, f.filename);
      if (await pathExists(target)) {
        io.stderr(`${PROGRAM} extract: refusing to overwrite "${target}" (use --force)`);
        return 1;
      }
    }
  }

  for (const f of files) {
    const target = join(parsed.args.to, f.filename);
    try {
      await writeFile(target, f.bytes);
    } catch (err) {
      io.stderr(`${PROGRAM} extract: cannot write "${target}": ${(err as Error).message}`);
      return 1;
    }
  }

  io.stdout(formatExtractReport(plan, parsed.args.to));
  return 0;
}

interface CreateCommandArgs {
  readonly front: string;
  readonly back: string;
  readonly output: string;
  readonly width: number;
  readonly height: number;
  readonly frontFormatOverride?: ImageFormat;
  readonly backFormatOverride?: ImageFormat;
  readonly flipAxis: FlipAxis;
  readonly defaultBack: boolean;
  readonly noFlipAnim: boolean;
  readonly meta?: string;
  readonly force: boolean;
}

type CreateParseResult =
  | { readonly kind: 'args'; readonly args: CreateCommandArgs }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit'; readonly code: number };

function parseIntegerOption(raw: string, name: string): number | string {
  if (!/^[0-9]+$/.test(raw)) return `--${name} must be a positive integer`;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 0xffffffff) {
    return `--${name} must be in the range 1..4294967295`;
  }
  return n;
}

function parseCreateArgs(argv: readonly string[], io: CliIo): CreateParseResult {
  let values: {
    help?: boolean;
    front?: string;
    back?: string;
    output?: string;
    width?: string;
    height?: string;
    'front-format'?: string;
    'back-format'?: string;
    'flip-axis'?: string;
    'default-back'?: boolean;
    'no-flip-anim'?: boolean;
    meta?: string;
    force?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h' },
        front: { type: 'string' },
        back: { type: 'string' },
        output: { type: 'string' },
        width: { type: 'string' },
        height: { type: 'string' },
        'front-format': { type: 'string' },
        'back-format': { type: 'string' },
        'flip-axis': { type: 'string' },
        'default-back': { type: 'boolean' },
        'no-flip-anim': { type: 'boolean' },
        meta: { type: 'string' },
        force: { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.stderr(`${PROGRAM} create: ${(err as Error).message}`);
    return { kind: 'exit', code: 2 };
  }

  if (values.help === true) return { kind: 'help' };

  if (positionals.length > 0) {
    io.stderr(`${PROGRAM} create: unexpected positional "${positionals[0]}"`);
    return { kind: 'exit', code: 2 };
  }

  const required: ReadonlyArray<[string, string | undefined]> = [
    ['--front', values.front],
    ['--back', values.back],
    ['--output', values.output],
    ['--width', values.width],
    ['--height', values.height],
  ];
  for (const [name, val] of required) {
    if (val === undefined || val === '') {
      io.stderr(`${PROGRAM} create: missing required ${name}`);
      return { kind: 'exit', code: 2 };
    }
  }

  const width = parseIntegerOption(values.width as string, 'width');
  if (typeof width === 'string') {
    io.stderr(`${PROGRAM} create: ${width}`);
    return { kind: 'exit', code: 2 };
  }
  const height = parseIntegerOption(values.height as string, 'height');
  if (typeof height === 'string') {
    io.stderr(`${PROGRAM} create: ${height}`);
    return { kind: 'exit', code: 2 };
  }

  let frontFormatOverride: ImageFormat | undefined;
  if (values['front-format'] !== undefined) {
    if (!isImageFormat(values['front-format'])) {
      io.stderr(
        `${PROGRAM} create: --front-format "${values['front-format']}" is not a known format`,
      );
      return { kind: 'exit', code: 2 };
    }
    frontFormatOverride = values['front-format'];
  }
  let backFormatOverride: ImageFormat | undefined;
  if (values['back-format'] !== undefined) {
    if (!isImageFormat(values['back-format'])) {
      io.stderr(
        `${PROGRAM} create: --back-format "${values['back-format']}" is not a known format`,
      );
      return { kind: 'exit', code: 2 };
    }
    backFormatOverride = values['back-format'];
  }

  let flipAxis: FlipAxis = 'horizontal';
  if (values['flip-axis'] !== undefined) {
    if (!isFlipAxis(values['flip-axis'])) {
      io.stderr(`${PROGRAM} create: --flip-axis must be horizontal | vertical | diagonal`);
      return { kind: 'exit', code: 2 };
    }
    flipAxis = values['flip-axis'];
  }

  const args: CreateCommandArgs = {
    front: values.front as string,
    back: values.back as string,
    output: values.output as string,
    width,
    height,
    flipAxis,
    defaultBack: values['default-back'] === true,
    noFlipAnim: values['no-flip-anim'] === true,
    force: values.force === true,
    ...(frontFormatOverride !== undefined ? { frontFormatOverride } : {}),
    ...(backFormatOverride !== undefined ? { backFormatOverride } : {}),
    ...(values.meta !== undefined ? { meta: values.meta } : {}),
  };
  return { kind: 'args', args };
}

async function runCreate(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseCreateArgs(argv, io);
  if (parsed.kind === 'help') {
    io.stdout(CREATE_HELP);
    return 0;
  }
  if (parsed.kind === 'exit') return parsed.code;
  const a = parsed.args;

  const frontFormat = a.frontFormatOverride ?? formatFromExtension(a.front);
  if (frontFormat === undefined) {
    io.stderr(`${PROGRAM} create: cannot infer format for "${a.front}"; pass --front-format`);
    return 2;
  }
  const backFormat = a.backFormatOverride ?? formatFromExtension(a.back);
  if (backFormat === undefined) {
    io.stderr(`${PROGRAM} create: cannot infer format for "${a.back}"; pass --back-format`);
    return 2;
  }

  const frontBytes = await readFileOrReport(a.front, io, 'create');
  if (typeof frontBytes === 'number') return frontBytes;
  const backBytes = await readFileOrReport(a.back, io, 'create');
  if (typeof backBytes === 'number') return backBytes;

  let metaBytes: Uint8Array | undefined;
  if (a.meta !== undefined) {
    const read = await readFileOrReport(a.meta, io, 'create');
    if (typeof read === 'number') return read;
    try {
      JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(read));
    } catch (err) {
      io.stderr(
        `${PROGRAM} create: --meta "${a.meta}" is not valid UTF-8 JSON: ${(err as Error).message}`,
      );
      return 1;
    }
    metaBytes = read;
  }

  if (!a.force && (await pathExists(a.output))) {
    io.stderr(`${PROGRAM} create: refusing to overwrite "${a.output}" (use --force)`);
    return 1;
  }

  let bytes: Uint8Array;
  try {
    bytes = buildFile({
      front: frontBytes,
      back: backBytes,
      frontFormat,
      backFormat,
      width: a.width,
      height: a.height,
      flipAxis: a.flipAxis,
      defaultBack: a.defaultBack,
      noFlipAnim: a.noFlipAnim,
      ...(metaBytes !== undefined ? { meta: metaBytes } : {}),
    });
  } catch (err) {
    if (err instanceof XflipError) {
      io.stderr(`${PROGRAM} create: ${err.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }

  try {
    await writeFile(a.output, bytes);
  } catch (err) {
    io.stderr(`${PROGRAM} create: cannot write "${a.output}": ${(err as Error).message}`);
    return 1;
  }

  io.stdout(
    `Created ${a.output}  (xflip 1.0, ${bytes.byteLength} bytes, ${a.width}x${a.height} ${frontFormat}/${backFormat})`,
  );
  return 0;
}

interface LayersAddArgs {
  readonly file: string;
  readonly output: string;
  readonly face: LayerFace;
  readonly image: string;
  readonly effectType: string;
  readonly formatOverride?: ImageFormat;
  readonly blendMode: BlendMode;
  readonly layerId?: number;
  readonly opacity?: number;
  readonly zOrder?: number;
  readonly responsePath?: string;
  readonly force: boolean;
  readonly strictAncillaryCrc: boolean;
}

type LayersAddParseResult =
  | { readonly kind: 'args'; readonly args: LayersAddArgs }
  | { readonly kind: 'help' }
  | { readonly kind: 'exit'; readonly code: number };

function parseUint8Option(raw: string, name: string): number | string {
  if (!/^[0-9]+$/.test(raw)) return `--${name} must be an integer in [0, 255]`;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 0xff) {
    return `--${name} must be in the range 0..255`;
  }
  return n;
}

function parseLayersAddArgs(argv: readonly string[], io: CliIo): LayersAddParseResult {
  let values: {
    help?: boolean;
    face?: string;
    image?: string;
    'effect-type'?: string;
    output?: string;
    format?: string;
    'blend-mode'?: string;
    'layer-id'?: string;
    opacity?: string;
    'z-order'?: string;
    response?: string;
    force?: boolean;
    'strict-ancillary-crc'?: boolean;
  };
  let positionals: string[];
  try {
    const parsed = parseArgs({
      args: [...argv],
      options: {
        help: { type: 'boolean', short: 'h' },
        face: { type: 'string' },
        image: { type: 'string' },
        'effect-type': { type: 'string' },
        output: { type: 'string' },
        format: { type: 'string' },
        'blend-mode': { type: 'string' },
        'layer-id': { type: 'string' },
        opacity: { type: 'string' },
        'z-order': { type: 'string' },
        response: { type: 'string' },
        force: { type: 'boolean' },
        'strict-ancillary-crc': { type: 'boolean' },
      },
      allowPositionals: true,
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (err) {
    io.stderr(`${PROGRAM} layers add: ${(err as Error).message}`);
    return { kind: 'exit', code: 2 };
  }

  if (values.help === true) return { kind: 'help' };

  const [file, ...extra] = positionals;
  if (file === undefined) {
    io.stderr(`${PROGRAM} layers add: missing <file> argument`);
    io.stderr(`Run \`${PROGRAM} help layers\` for usage.`);
    return { kind: 'exit', code: 2 };
  }
  if (extra.length > 0) {
    io.stderr(`${PROGRAM} layers add: unexpected extra argument "${extra[0]}"`);
    return { kind: 'exit', code: 2 };
  }

  const required: ReadonlyArray<[string, string | undefined]> = [
    ['--face', values.face],
    ['--image', values.image],
    ['--effect-type', values['effect-type']],
    ['--output', values.output],
  ];
  for (const [name, val] of required) {
    if (val === undefined || val === '') {
      io.stderr(`${PROGRAM} layers add: missing required ${name}`);
      return { kind: 'exit', code: 2 };
    }
  }

  const face = values.face as string;
  if (face !== 'front' && face !== 'back') {
    io.stderr(`${PROGRAM} layers add: --face must be "front" or "back"`);
    return { kind: 'exit', code: 2 };
  }

  let formatOverride: ImageFormat | undefined;
  if (values.format !== undefined) {
    if (!isImageFormat(values.format)) {
      io.stderr(`${PROGRAM} layers add: --format "${values.format}" is not a known format`);
      return { kind: 'exit', code: 2 };
    }
    formatOverride = values.format;
  }

  let blendMode: BlendMode = 'normal';
  if (values['blend-mode'] !== undefined) {
    if (!isBlendMode(values['blend-mode'])) {
      io.stderr(
        `${PROGRAM} layers add: --blend-mode "${values['blend-mode']}" is not a known blend mode`,
      );
      return { kind: 'exit', code: 2 };
    }
    blendMode = values['blend-mode'];
  }

  let layerId: number | undefined;
  if (values['layer-id'] !== undefined) {
    const parsed = parseUint8Option(values['layer-id'], 'layer-id');
    if (typeof parsed === 'string') {
      io.stderr(`${PROGRAM} layers add: ${parsed}`);
      return { kind: 'exit', code: 2 };
    }
    layerId = parsed;
  }
  let opacity: number | undefined;
  if (values.opacity !== undefined) {
    const parsed = parseUint8Option(values.opacity, 'opacity');
    if (typeof parsed === 'string') {
      io.stderr(`${PROGRAM} layers add: ${parsed}`);
      return { kind: 'exit', code: 2 };
    }
    opacity = parsed;
  }
  let zOrder: number | undefined;
  if (values['z-order'] !== undefined) {
    const parsed = parseUint8Option(values['z-order'], 'z-order');
    if (typeof parsed === 'string') {
      io.stderr(`${PROGRAM} layers add: ${parsed}`);
      return { kind: 'exit', code: 2 };
    }
    zOrder = parsed;
  }

  const args: LayersAddArgs = {
    file,
    output: values.output as string,
    face: face as LayerFace,
    image: values.image as string,
    effectType: values['effect-type'] as string,
    blendMode,
    force: values.force === true,
    strictAncillaryCrc: values['strict-ancillary-crc'] === true,
    ...(formatOverride !== undefined ? { formatOverride } : {}),
    ...(layerId !== undefined ? { layerId } : {}),
    ...(opacity !== undefined ? { opacity } : {}),
    ...(zOrder !== undefined ? { zOrder } : {}),
    ...(values.response !== undefined ? { responsePath: values.response } : {}),
  };
  return { kind: 'args', args };
}

async function runLayers(argv: readonly string[], io: CliIo): Promise<number> {
  const [sub, ...rest] = argv;
  if (sub === undefined || sub === '--help' || sub === '-h' || sub === 'help') {
    io.stdout(LAYERS_ADD_HELP);
    return sub === undefined ? 2 : 0;
  }
  if (sub !== 'add') {
    io.stderr(`${PROGRAM} layers: unknown subcommand "${sub}"`);
    io.stderr(`Run \`${PROGRAM} help layers\` for usage.`);
    return 2;
  }
  return runLayersAdd(rest, io);
}

async function runLayersAdd(argv: readonly string[], io: CliIo): Promise<number> {
  const parsed = parseLayersAddArgs(argv, io);
  if (parsed.kind === 'help') {
    io.stdout(LAYERS_ADD_HELP);
    return 0;
  }
  if (parsed.kind === 'exit') return parsed.code;
  const a = parsed.args;

  const format = a.formatOverride ?? formatFromExtension(a.image);
  if (format === undefined) {
    io.stderr(`${PROGRAM} layers add: cannot infer format for "${a.image}"; pass --format`);
    return 2;
  }

  const fileBytes = await readFileOrReport(a.file, io, 'layers add');
  if (typeof fileBytes === 'number') return fileBytes;
  const imageBytes = await readFileOrReport(a.image, io, 'layers add');
  if (typeof imageBytes === 'number') return imageBytes;

  let response: XflipLayerResponse | undefined;
  if (a.responsePath !== undefined) {
    const read = await readFileOrReport(a.responsePath, io, 'layers add');
    if (typeof read === 'number') return read;
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(read);
    } catch (err) {
      io.stderr(
        `${PROGRAM} layers add: --response "${a.responsePath}" is not valid UTF-8: ${(err as Error).message}`,
      );
      return 1;
    }
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (err) {
      io.stderr(
        `${PROGRAM} layers add: --response "${a.responsePath}" is not valid JSON: ${(err as Error).message}`,
      );
      return 1;
    }
    if (json === null || typeof json !== 'object' || Array.isArray(json)) {
      io.stderr(`${PROGRAM} layers add: --response root must be a JSON object`);
      return 1;
    }
    response = json as XflipLayerResponse;
  }

  let outBytes: Uint8Array;
  try {
    const file = decode(fileBytes, { strictAncillaryCrc: a.strictAncillaryCrc });
    const updated = addLayer(file, {
      face: a.face,
      image: imageBytes,
      format,
      blendMode: a.blendMode,
      effectType: a.effectType,
      ...(a.layerId !== undefined ? { layerId: a.layerId } : {}),
      ...(a.opacity !== undefined ? { opacity: a.opacity } : {}),
      ...(a.zOrder !== undefined ? { zOrder: a.zOrder } : {}),
      ...(response !== undefined ? { response } : {}),
    });
    outBytes = encodeWithLayer(updated);
  } catch (err) {
    if (err instanceof XflipError) {
      io.stderr(`${PROGRAM} layers add: ${err.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }

  if (!a.force && a.output !== a.file && (await pathExists(a.output))) {
    io.stderr(`${PROGRAM} layers add: refusing to overwrite "${a.output}" (use --force)`);
    return 1;
  }
  if (a.output === a.file && !a.force) {
    io.stderr(
      `${PROGRAM} layers add: refusing to overwrite input "${a.output}" in place (use --force)`,
    );
    return 1;
  }

  try {
    await writeFile(a.output, outBytes);
  } catch (err) {
    io.stderr(`${PROGRAM} layers add: cannot write "${a.output}": ${(err as Error).message}`);
    return 1;
  }

  io.stdout(
    `Added layer to ${a.face} face → ${a.output}  (xflip 1.1, ${outBytes.byteLength} bytes, effect=${a.effectType}, blend=${a.blendMode})`,
  );
  return 0;
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err: unknown) => {
      process.stderr.write(`${PROGRAM}: ${(err as Error).stack ?? String(err)}\n`);
      process.exitCode = 1;
    },
  );
}
