#!/usr/bin/env node
/**
 * Cross-platform CLI smoke test (P4.6). Runs the built `xflip` bin
 * against a freshly-generated v1.0 file plus the layered create/inspect/
 * validate/extract/layers-add flow. Exits non-zero on any failure so the
 * CI matrix surfaces OS-specific path / line-ending bugs.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const CLI = resolve(ROOT, 'packages/xflip-cli/dist/cli.js');

const tmp = mkdtempSync(join(tmpdir(), 'xflip-smoke-'));
const frontPng = join(tmp, 'front.png');
const backJpg = join(tmp, 'back.jpg');
const outFile = join(tmp, 'card.xflip');
const extractDir = join(tmp, 'out');
const layerPng = join(tmp, 'layer.png');
const layeredFile = join(tmp, 'layered.xflip');
const metaJson = join(tmp, 'meta.json');

writeFileSync(frontPng, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
writeFileSync(backJpg, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]));
writeFileSync(layerPng, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x01, 0x02]));
writeFileSync(metaJson, '{"title":"smoke"}');

const checks = [];

const exec = (label, args, expectedCode = 0) => {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  const ok = r.status === expectedCode;
  checks.push({ label, ok, status: r.status, expectedCode, stdout: r.stdout, stderr: r.stderr });
  if (!ok) {
    console.error(`FAIL ${label}: exit ${r.status} (expected ${expectedCode})`);
    if (r.stdout) console.error(`stdout:\n${r.stdout}`);
    if (r.stderr) console.error(`stderr:\n${r.stderr}`);
  } else {
    console.log(`ok   ${label}`);
  }
  return r;
};

exec('help', ['help']);
exec('create', [
  'create',
  '--front', frontPng,
  '--back', backJpg,
  '--output', outFile,
  '--width', '64',
  '--height', '64',
  '--meta', metaJson,
]);
exec('inspect', ['inspect', outFile]);
exec('validate', ['validate', outFile]);
exec('extract', ['extract', outFile, '--to', extractDir]);
exec('layers-add', [
  'layers', 'add', outFile,
  '--face', 'front',
  '--image', layerPng,
  '--effect-type', 'holographic',
  '--blend-mode', 'overlay',
  '--output', layeredFile,
]);
exec('validate-layered', ['validate', layeredFile]);

// Sanity: extracted META should match what we embedded.
const extractedMeta = readFileSync(join(extractDir, 'meta.json'), 'utf8');
const metaOk = extractedMeta === '{"title":"smoke"}';
checks.push({ label: 'meta-roundtrip', ok: metaOk });
console.log(`${metaOk ? 'ok  ' : 'FAIL'} meta-roundtrip`);

// Expected-failure: unknown command must exit 2.
exec('unknown-command-exits-2', ['nope'], 2);

rmSync(tmp, { recursive: true, force: true });

const failed = checks.filter((c) => !c.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} check(s) failed`);
  process.exit(1);
}
console.log(`\nAll ${checks.length} checks passed`);
