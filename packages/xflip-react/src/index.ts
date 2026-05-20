/**
 * `@xflip/react` — React wrapper around the `<xflip-card>` web component.
 */

// Re-export viewer types so consumers don't need a direct dep on `@xflip/viewer`.
export type {
  XflipCardElement,
  XflipErrorEventDetail,
  XflipFace,
  XflipLoadEventDetail,
} from '@xflip/viewer';
export type { XflipCardIntrinsicAttributes } from './jsx-intrinsic.js';
export { type UseXflipResult, useXflip, type XflipStatus } from './use-xflip.js';
export { XflipCard, type XflipCardProps } from './xflip-card.js';

export const VERSION = '0.0.0';
