import { XflipError } from '@xflip/core';
import { describe, expect, it } from 'vitest';
import { MINIMAL_V1_BYTES } from '../../../tests/fixtures/golden/minimal-v1.js';
import { formatInspectReport, inspect } from './inspect.js';

describe('inspect', () => {
  it('returns version and chunk summary for a valid v1.0 file', () => {
    const result = inspect(MINIMAL_V1_BYTES);
    expect(result.versionMajor).toBe(1);
    expect(result.versionMinor).toBe(0);
    expect(result.bytes).toBe(MINIMAL_V1_BYTES.byteLength);
    expect(result.chunks.map((c) => c.type)).toEqual(['HEAD', 'FRNT', 'BACK']);
    expect(result.chunks.every((c) => c.critical)).toBe(true);
  });

  it('reports each chunk payload length and source offset', () => {
    const result = inspect(MINIMAL_V1_BYTES);
    const head = result.chunks.find((c) => c.type === 'HEAD');
    expect(head?.length).toBe(12);
    expect(head?.offset).toBe(6);
  });

  it('throws XflipError on invalid signature', () => {
    const bogus = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => inspect(bogus)).toThrow(XflipError);
  });
});

describe('formatInspectReport', () => {
  it('renders header lines plus one row per chunk', () => {
    const result = inspect(MINIMAL_V1_BYTES);
    const report = formatInspectReport(result, 'fixture.xflip');
    expect(report).toContain('xflip file: fixture.xflip');
    expect(report).toContain(`size:    ${MINIMAL_V1_BYTES.byteLength} bytes`);
    expect(report).toContain('version: 1.0');
    expect(report).toMatch(/HEAD\s+6\s+12\s+yes/);
    expect(report).toMatch(/FRNT/);
    expect(report).toMatch(/BACK/);
  });
});
