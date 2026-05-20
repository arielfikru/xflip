import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MINIMAL_V1_BYTES } from '../../../tests/fixtures/golden/minimal-v1.js';
import { run } from './cli.js';

interface Captured {
  readonly io: { stdout: (line: string) => void; stderr: (line: string) => void };
  readonly out: string[];
  readonly err: string[];
}

const capture = (): Captured => {
  const out: string[] = [];
  const err: string[] = [];
  return {
    io: { stdout: (line) => out.push(line), stderr: (line) => err.push(line) },
    out,
    err,
  };
};

describe('cli', () => {
  let tmp: string;

  beforeEach(async () => {
    tmp = await mkdtemp(join(tmpdir(), 'xflip-cli-'));
  });

  afterEach(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it('prints root help when no command is given', async () => {
    const c = capture();
    const code = await run([], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Usage:');
    expect(c.out.join('\n')).toContain('inspect <file>');
  });

  it('prints inspect help via `help inspect`', async () => {
    const c = capture();
    const code = await run(['help', 'inspect'], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('xflip inspect <file>');
  });

  it('exits 2 on unknown command', async () => {
    const c = capture();
    const code = await run(['nope'], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('unknown command "nope"');
  });

  it('inspects a valid file and reports chunks', async () => {
    const path = join(tmp, 'card.xflip');
    await writeFile(path, MINIMAL_V1_BYTES);
    const c = capture();
    const code = await run(['inspect', path], c.io);
    expect(code).toBe(0);
    const out = c.out.join('\n');
    expect(out).toContain(`xflip file: ${path}`);
    expect(out).toContain('version: 1.0');
    expect(out).toMatch(/HEAD\s+6\s+12\s+yes/);
  });

  it('inspect missing file argument exits 2', async () => {
    const c = capture();
    const code = await run(['inspect'], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('missing <file>');
  });

  it('inspect on unreadable path exits 1', async () => {
    const c = capture();
    const code = await run(['inspect', join(tmp, 'does-not-exist.xflip')], c.io);
    expect(code).toBe(1);
    expect(c.err.join('\n')).toMatch(/cannot read/);
  });

  it('inspect on malformed file exits 1 with XflipError name', async () => {
    const path = join(tmp, 'bogus.xflip');
    await writeFile(path, new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    const c = capture();
    const code = await run(['inspect', path], c.io);
    expect(code).toBe(1);
    expect(c.err.join('\n')).toContain('XflipParseError');
  });

  it('inspect --help short-circuits before reading args', async () => {
    const c = capture();
    const code = await run(['inspect', '--help'], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('xflip inspect <file>');
  });
});
