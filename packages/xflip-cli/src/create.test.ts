import { decode } from '@xflip/core';
import { describe, expect, it } from 'vitest';
import { buildFile, formatFromExtension } from './create.js';

describe('formatFromExtension', () => {
  it.each([
    ['card.png', 'png'],
    ['Card.PNG', 'png'],
    ['photo.jpg', 'jpeg'],
    ['photo.JPEG', 'jpeg'],
    ['art.webp', 'webp'],
    ['art.avif', 'avif'],
    ['art.jxl', 'jxl'],
    ['blob.bin', 'raw'],
    ['blob.raw', 'raw'],
  ])('infers %s → %s', (filename, expected) => {
    expect(formatFromExtension(filename)).toBe(expected);
  });

  it.each([
    'noext',
    'trailing.',
    '.hiddenstart',
    'card.xyz',
    'card.tiff',
  ])('returns undefined for %s', (filename) => {
    expect(formatFromExtension(filename)).toBeUndefined();
  });
});

describe('buildFile', () => {
  it('round-trips through decode preserving inputs', () => {
    const front = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const back = new Uint8Array([0xff, 0xd8]);
    const bytes = buildFile({
      front,
      back,
      frontFormat: 'png',
      backFormat: 'jpeg',
      width: 512,
      height: 720,
      flipAxis: 'vertical',
      defaultBack: true,
      noFlipAnim: true,
    });
    const decoded = decode(bytes);
    expect(decoded.versionMajor).toBe(1);
    expect(decoded.versionMinor).toBe(0);
    expect(decoded.head.width).toBe(512);
    expect(decoded.head.height).toBe(720);
    expect(decoded.head.frontFormat).toBe('png');
    expect(decoded.head.backFormat).toBe('jpeg');
    expect(decoded.head.flipAxis).toBe('vertical');
    expect(decoded.head.flags).toBe(0x03);
    expect(Array.from(decoded.front)).toEqual(Array.from(front));
    expect(Array.from(decoded.back)).toEqual(Array.from(back));
    expect(decoded.ancillary?.has('META') ?? false).toBe(false);
  });

  it('embeds META when meta bytes are supplied', () => {
    const meta = new TextEncoder().encode('{"title":"X"}');
    const bytes = buildFile({
      front: new Uint8Array([1]),
      back: new Uint8Array([2]),
      frontFormat: 'png',
      backFormat: 'png',
      width: 1,
      height: 1,
      meta,
    });
    const decoded = decode(bytes);
    expect(decoded.ancillary?.get('META')).toEqual(meta);
  });

  it('defaults flip-axis to horizontal and flags to 0', () => {
    const bytes = buildFile({
      front: new Uint8Array([1]),
      back: new Uint8Array([2]),
      frontFormat: 'png',
      backFormat: 'png',
      width: 1,
      height: 1,
    });
    const decoded = decode(bytes);
    expect(decoded.head.flipAxis).toBe('horizontal');
    expect(decoded.head.flags).toBe(0);
  });
});
