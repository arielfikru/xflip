#!/usr/bin/env node
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { XflipError } from '@xflip/core';
import { extract, formatExtractReport } from './extract.js';
import { formatInspectReport, inspect } from './inspect.js';
import { formatValidateReport, validate } from './validate.js';

const PROGRAM = 'xflip';

const ROOT_HELP = `${PROGRAM} — command-line tool for the xflip image format

Usage:
  ${PROGRAM} <command> [options]

Commands:
  inspect <file>          Print chunk structure of an xflip file
  validate <file>         Verify CRC + structural validity (exit 1 if invalid)
  extract <file> --to D   Write FRNT/BACK (+ META) into directory D
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
