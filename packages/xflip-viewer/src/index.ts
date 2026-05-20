import { XFLIP_CARD_TAG, XflipCardElement } from './xflip-card.js';

export { XFLIP_CARD_TAG, XflipCardElement } from './xflip-card.js';

/**
 * Convenience registration helper.
 *
 * Prefer importing `@xflip/viewer/define` for plain side-effect registration;
 * call this when you need to register under a custom tag name.
 *
 * @param tagName - Optional custom tag (default: `xflip-card`).
 */
export function defineXflipCard(tagName: string = XFLIP_CARD_TAG): void {
  XflipCardElement.register(tagName);
}
