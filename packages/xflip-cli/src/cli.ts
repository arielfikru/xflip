#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { XflipError } from '@xflip/core';
import { formatInspectReport, inspect } from './inspect.js';

const PROGRAM = 'xflip';

const ROOT_HELP = `${PROGRAM} — command-line tool for the xflip image format

Usage:
  ${PROGRAM} <command> [options]

Commands:
  inspect <file>    Print chunk structure of an xflip file
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

  io.stderr(`${PROGRAM}: unknown command "${command}"`);
  io.stderr(`Run \`${PROGRAM} help\` for usage.`);
  return 2;
}

async function runInspect(argv: readonly string[], io: CliIo): Promise<number> {
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
    io.stderr(`${PROGRAM} inspect: ${(err as Error).message}`);
    return 2;
  }

  if (values.help === true) {
    io.stdout(INSPECT_HELP);
    return 0;
  }

  const [file, ...extra] = positionals;
  if (file === undefined) {
    io.stderr(`${PROGRAM} inspect: missing <file> argument`);
    io.stderr(`Run \`${PROGRAM} help inspect\` for usage.`);
    return 2;
  }
  if (extra.length > 0) {
    io.stderr(`${PROGRAM} inspect: unexpected extra argument "${extra[0]}"`);
    return 2;
  }

  let bytes: Uint8Array;
  try {
    bytes = await readFile(file);
  } catch (err) {
    io.stderr(`${PROGRAM} inspect: cannot read "${file}": ${(err as Error).message}`);
    return 1;
  }

  try {
    const result = inspect(bytes, {
      strictAncillaryCrc: values['strict-ancillary-crc'] === true,
    });
    io.stdout(formatInspectReport(result, file));
    return 0;
  } catch (err) {
    if (err instanceof XflipError) {
      io.stderr(`${PROGRAM} inspect: ${err.name}: ${err.message}`);
      return 1;
    }
    throw err;
  }
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
