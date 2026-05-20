import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * JSX intrinsic-element augmentation so consumers can drop the raw
 * `<xflip-card>` tag in JSX with type safety:
 *
 * ```tsx
 * import '@xflip/react/jsx-intrinsic'; // (re-exported from package root)
 * <xflip-card src="/hero.xflip" />
 * ```
 *
 * The {@link XflipCard} component does not need this; it casts the tag
 * name internally.
 */
export interface XflipCardIntrinsicAttributes
  extends DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> {
  src?: string | undefined;
}

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'xflip-card': XflipCardIntrinsicAttributes;
    }
  }
}
