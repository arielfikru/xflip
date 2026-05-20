import { XFLIP_CARD_TAG, XflipCardElement } from './xflip-card.js';

/**
 * Side-effect entry: registers `<xflip-card>` on import.
 *
 * @example
 * ```ts
 * import '@xflip/viewer/define';
 * ```
 */
if (typeof customElements !== 'undefined') {
  XflipCardElement.register(XFLIP_CARD_TAG);
}
