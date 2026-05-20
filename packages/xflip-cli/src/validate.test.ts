import { describe, expect, it } from 'vitest';
import { MINIMAL_V1_BYTES } from '../../../tests/fixtures/golden/minimal-v1.js';
import { formatValidateReport, validate } from './validate.js';

describe('validate', () => {
  it('reports valid v1.0 file with version + size', () => {
    const result = validate(MINIMAL_V1_BYTES);
    expect(result.valid).toBe(true);
    if (result.valid) {
      expect(result.versionMajor).toBe(1);
      expect(result.versionMinor).toBe(0);
      expect(result.bytes).toBe(MINIMAL_V1_BYTES.byteLength);
    }
  });

  it('reports invalid file without throwing', () => {
    const bogus = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07]);
    const result = validate(bogus);
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errorName).toContain('Xflip');
      expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it('catches CRC corruption mid-chunk', () => {
    const corrupted = new Uint8Array(MINIMAL_V1_BYTES);
    corrupted[corrupted.length - 1] = (corrupted[corrupted.length - 1] ?? 0) ^ 0xff;
    const result = validate(corrupted);
    expect(result.valid).toBe(false);
  });
});

describe('formatValidateReport', () => {
  it('renders single-line OK for valid file', () => {
    const result = validate(MINIMAL_V1_BYTES);
    const report = formatValidateReport(result, 'fixture.xflip');
    expect(report).toMatch(/^OK\s+fixture\.xflip\s+\(xflip 1\.0, \d+ bytes\)$/);
  });

  it('renders multi-line FAIL with error class + message', () => {
    const bogus = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const result = validate(bogus);
    const report = formatValidateReport(result, 'bad.xflip');
    expect(report.startsWith('FAIL  bad.xflip')).toBe(true);
    expect(report).toContain('Xflip');
  });
});
