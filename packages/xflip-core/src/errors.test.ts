import { describe, expect, test } from 'vitest';
import { XflipCrcError, XflipEncodeError, XflipError, XflipParseError } from './errors.js';

describe('XflipError', () => {
  test('is an Error subclass', () => {
    const err = new XflipError('boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(XflipError);
    expect(err.message).toBe('boom');
    expect(err.name).toBe('XflipError');
  });

  test('preserves cause when provided', () => {
    const cause = new Error('root');
    const err = new XflipError('wrap', { cause });
    expect(err.cause).toBe(cause);
  });

  test('omits cause property when not provided', () => {
    const err = new XflipError('boom');
    expect(err.cause).toBeUndefined();
  });
});

describe('XflipParseError', () => {
  test('formats offset into message in hex', () => {
    const err = new XflipParseError('bad chunk', 0xab);
    expect(err.message).toBe('[offset 0xab] bad chunk');
    expect(err.offset).toBe(0xab);
    expect(err.name).toBe('XflipParseError');
  });

  test('is a subclass of XflipError', () => {
    const err = new XflipParseError('x', 0);
    expect(err).toBeInstanceOf(XflipError);
  });

  test('offset 0 still produces valid prefix', () => {
    const err = new XflipParseError('start', 0);
    expect(err.message).toBe('[offset 0x0] start');
  });
});

describe('XflipCrcError', () => {
  test('embeds chunk type and both checksums', () => {
    const err = new XflipCrcError('FRNT', 0x1e, 0xdeadbeef, 0x12345678);
    expect(err.chunkType).toBe('FRNT');
    expect(err.expected).toBe(0xdeadbeef);
    expect(err.actual).toBe(0x12345678);
    expect(err.name).toBe('XflipCrcError');
    expect(err.message).toContain('FRNT');
    expect(err.message).toContain('0xdeadbeef');
    expect(err.message).toContain('0x12345678');
    expect(err.message).toContain('0x1e');
  });

  test('zero-pads short checksum hex to 8 chars', () => {
    const err = new XflipCrcError('HEAD', 0, 0x1, 0x2);
    expect(err.message).toContain('0x00000001');
    expect(err.message).toContain('0x00000002');
  });

  test('is a subclass of XflipParseError', () => {
    const err = new XflipCrcError('HEAD', 0, 0, 0);
    expect(err).toBeInstanceOf(XflipParseError);
    expect(err).toBeInstanceOf(XflipError);
  });
});

describe('XflipEncodeError', () => {
  test('is a subclass of XflipError but not ParseError', () => {
    const err = new XflipEncodeError('cannot encode');
    expect(err).toBeInstanceOf(XflipError);
    expect(err).not.toBeInstanceOf(XflipParseError);
    expect(err.name).toBe('XflipEncodeError');
  });
});
