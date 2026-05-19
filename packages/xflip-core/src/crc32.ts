/**
 * CRC-32/ISO-HDLC (a.k.a. the PNG polynomial).
 *
 * Polynomial:   0xEDB88320 (reflected form of 0x04C11DB7)
 * Initial:      0xFFFFFFFF
 * Final XOR:    0xFFFFFFFF
 * Reflect in:   yes (handled by reflected polynomial)
 * Reflect out:  yes
 *
 * Hand-implemented to honour the "zero runtime dependencies" constraint
 * (AGENTS.md Section 3.5).
 */

const TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/**
 * Compute the CRC-32 of a byte sequence, PNG polynomial.
 *
 * @param bytes - Input bytes.
 * @returns 32-bit unsigned checksum.
 *
 * @example
 * ```ts
 * crc32(new Uint8Array()); // 0x00000000
 * crc32(new TextEncoder().encode('123456789')); // 0xcbf43926
 * ```
 */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i] as number;
    const idx = (c ^ byte) & 0xff;
    c = ((TABLE[idx] as number) ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Compute the CRC-32 of the concatenation of multiple byte spans without
 * allocating a joined buffer. Useful for chunk validation where the CRC is
 * computed over `TYPE + PAYLOAD`.
 *
 * @param parts - Byte spans, processed in order.
 * @returns 32-bit unsigned checksum.
 */
export function crc32Concat(...parts: readonly Uint8Array[]): number {
  let c = 0xffffffff;
  for (const part of parts) {
    for (let i = 0; i < part.length; i++) {
      const byte = part[i] as number;
      const idx = (c ^ byte) & 0xff;
      c = ((TABLE[idx] as number) ^ (c >>> 8)) >>> 0;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
