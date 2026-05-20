import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { encode, type XflipFile } from '@xflip/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MINIMAL_V1_BYTES } from '../../../tests/fixtures/golden/minimal-v1.js';
import { run } from './cli.js';

const buildWithMeta = (metaJson: string): Uint8Array => {
  const file: XflipFile = {
    versionMajor: 1,
    versionMinor: 0,
    head: {
      width: 2,
      height: 2,
      frontFormat: 'png',
      backFormat: 'jpeg',
      flipAxis: 'horizontal',
      flags: 0,
    },
    front: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    back: new Uint8Array([0xff, 0xd8, 0xff]),
    ancillary: new Map([['META', new TextEncoder().encode(metaJson)]]),
  };
  return encode(file);
};

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

  it('validate on valid file exits 0 with OK line on stdout', async () => {
    const path = join(tmp, 'good.xflip');
    await writeFile(path, MINIMAL_V1_BYTES);
    const c = capture();
    const code = await run(['validate', path], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toMatch(/^OK\s+/);
    expect(c.err).toEqual([]);
  });

  it('validate on malformed file exits 1 with FAIL on stderr', async () => {
    const path = join(tmp, 'bad.xflip');
    await writeFile(path, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    const c = capture();
    const code = await run(['validate', path], c.io);
    expect(code).toBe(1);
    expect(c.err.join('\n')).toContain('FAIL');
    expect(c.err.join('\n')).toContain('Xflip');
  });

  it('validate missing file argument exits 2', async () => {
    const c = capture();
    const code = await run(['validate'], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('missing <file>');
  });

  it('help validate prints validate-specific help', async () => {
    const c = capture();
    const code = await run(['help', 'validate'], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('xflip validate <file>');
  });

  it('root help mentions validate command', async () => {
    const c = capture();
    const code = await run([], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('validate <file>');
  });

  it('extract writes front + back + meta.json into target dir', async () => {
    const src = join(tmp, 'card.xflip');
    await writeFile(src, buildWithMeta('{"title":"Zapdos"}'));
    const outDir = join(tmp, 'out');
    const c = capture();
    const code = await run(['extract', src, '--to', outDir], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('Extracted xflip 1.0');
    const front = await readFile(join(outDir, 'front.png'));
    const back = await readFile(join(outDir, 'back.jpg'));
    const meta = await readFile(join(outDir, 'meta.json'), 'utf-8');
    expect(front.byteLength).toBe(4);
    expect(back.byteLength).toBe(3);
    expect(meta).toBe('{"title":"Zapdos"}');
  });

  it('extract creates the target directory if missing', async () => {
    const src = join(tmp, 'card.xflip');
    await writeFile(src, MINIMAL_V1_BYTES);
    const outDir = join(tmp, 'nested', 'deeper');
    const c = capture();
    const code = await run(['extract', src, '--to', outDir], c.io);
    expect(code).toBe(0);
    await readFile(join(outDir, 'front.png'));
    await readFile(join(outDir, 'back.png'));
  });

  it('extract refuses to overwrite existing files without --force', async () => {
    const src = join(tmp, 'card.xflip');
    await writeFile(src, MINIMAL_V1_BYTES);
    const outDir = join(tmp, 'out');
    await writeFile(join(tmp, 'preexist-marker'), 'x');
    // First extraction succeeds
    const first = capture();
    expect(await run(['extract', src, '--to', outDir], first.io)).toBe(0);
    // Second without --force fails
    const second = capture();
    const code = await run(['extract', src, '--to', outDir], second.io);
    expect(code).toBe(1);
    expect(second.err.join('\n')).toContain('refusing to overwrite');
  });

  it('extract --force overwrites existing files', async () => {
    const src = join(tmp, 'card.xflip');
    await writeFile(src, MINIMAL_V1_BYTES);
    const outDir = join(tmp, 'out');
    const c1 = capture();
    expect(await run(['extract', src, '--to', outDir], c1.io)).toBe(0);
    const c2 = capture();
    const code = await run(['extract', src, '--to', outDir, '--force'], c2.io);
    expect(code).toBe(0);
  });

  it('extract missing --to exits 2', async () => {
    const src = join(tmp, 'card.xflip');
    await writeFile(src, MINIMAL_V1_BYTES);
    const c = capture();
    const code = await run(['extract', src], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('--to');
  });

  it('extract missing <file> exits 2', async () => {
    const c = capture();
    const code = await run(['extract', '--to', tmp], c.io);
    expect(code).toBe(2);
    expect(c.err.join('\n')).toContain('missing <file>');
  });

  it('extract on malformed file exits 1', async () => {
    const src = join(tmp, 'bad.xflip');
    await writeFile(src, new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    const c = capture();
    const code = await run(['extract', src, '--to', join(tmp, 'out')], c.io);
    expect(code).toBe(1);
    expect(c.err.join('\n')).toContain('Xflip');
  });

  it('extract on unreadable input exits 1', async () => {
    const c = capture();
    const code = await run(['extract', join(tmp, 'nope.xflip'), '--to', join(tmp, 'out')], c.io);
    expect(code).toBe(1);
    expect(c.err.join('\n')).toMatch(/cannot read/);
  });

  it('extract --help short-circuits before reading args', async () => {
    const c = capture();
    const code = await run(['extract', '--help'], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('xflip extract <file>');
  });

  it('help extract prints extract-specific help', async () => {
    const c = capture();
    const code = await run(['help', 'extract'], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('xflip extract <file>');
  });

  it('root help mentions extract command', async () => {
    const c = capture();
    const code = await run([], c.io);
    expect(code).toBe(0);
    expect(c.out.join('\n')).toContain('extract <file>');
  });
});
