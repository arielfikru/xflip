#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { XflipError } from '@xflip/core';
import { formatInspectReport, inspect } from './inspect.js';
import { formatValidateReport, validate } from './validate.js';

const PROGRAM = 'xflip';

const ROOT_HELP = `${PROGRAM} — command-line tool for the xflip image format

Usage:
  ${PROGRAM} <command> [options]

Commands:
  inspect <file>    Print chunk structure of an xflip file
  validate <file>   Verify CRC + structural validity (exit 1 if invalid)
  help [command]    Show help for a command

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
