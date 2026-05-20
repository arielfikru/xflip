import type { XflipFile } from '@xflip/core';
import type { XflipCardElement, XflipErrorEventDetail, XflipLoadEventDetail } from '@xflip/viewer';
import {
  type CSSProperties,
  type ForwardedRef,
  forwardRef,
  type ReactElement,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from 'react';

// Inlined to keep the module SSR-safe: importing `@xflip/viewer` at module
// scope evaluates a `class extends HTMLElement` declaration, which throws
// `HTMLElement is not defined` under Node. The actual registration uses
// the same tag via a dynamic import inside `ensureDefined`.
const XFLIP_CARD_TAG = 'xflip-card';

/**
 * Props for the {@link XflipCard} component.
 *
 * Most attribute props map 1:1 to attributes on the underlying
 * `<xflip-card>` element. `onLoad` / `onError` are React-style callbacks
 * that subscribe to the element's `xflip-load` / `xflip-error` custom
 * events.
 */
export interface XflipCardProps {
  /** URL of an `.xflip` file. Maps to the `src` attribute. */
  src?: string | undefined;
  /** Fired after a file is fetched and decoded. */
  onLoad?: ((file: XflipFile) => void) | undefined;
  /** Fired when fetch or decode fails. */
  onError?: ((error: Error) => void) | undefined;
  /**
   * Pointer tilt magnitude in degrees at the host's edges. Applied as a
   * property on the element (not an attribute) on every render. `0`
   * disables tilt without removing listeners.
   */
  tiltMax?: number | undefined;
  className?: string | undefined;
  style?: CSSProperties | undefined;
  id?: string | undefined;
  hidden?: boolean | undefined;
  /**
   * `aria-label` for the host element. The viewer doesn't add one by
   * default since the card's meaning is context-dependent.
   */
  'aria-label'?: string | undefined;
}

let definePromise: Promise<void> | null = null;
function ensureDefined(): Promise<void> {
  if (definePromise) return definePromise;
  // Dynamic import keeps `@xflip/viewer` (which evaluates a
  // `class extends HTMLElement` at module load) out of the server bundle.
  // The bundler still chunks it for the client.
  definePromise = import('@xflip/viewer').then(({ defineXflipCard }) => {
    defineXflipCard();
  });
  return definePromise;
}

function assignRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * Typed React wrapper around the `<xflip-card>` web component.
 *
 * @remarks
 * The first time a component instance mounts on the client, the wrapper
 * registers the `<xflip-card>` custom element. The registration is
 * idempotent and safe to call repeatedly.
 *
 * Forward a ref to access the underlying {@link XflipCardElement} (e.g. to
 * call `enableGyroscope()` or `toggleFace()`).
 *
 * @example
 * ```tsx
 * <XflipCard
 *   src="/hero.xflip"
 *   onLoad={(file) => console.log('decoded', file)}
 *   onError={(err) => console.error(err)}
 * />
 * ```
 */
export const XflipCard = forwardRef<XflipCardElement, XflipCardProps>(
  function XflipCard(props, forwardedRef): ReactElement {
    const { src, onLoad, onError, tiltMax, className, style, id, hidden } = props;
    const ariaLabel = props['aria-label'];
    const elementRef = useRef<XflipCardElement | null>(null);

    const setElement = useCallback(
      (el: XflipCardElement | null) => {
        elementRef.current = el;
        assignRef(forwardedRef, el);
      },
      [forwardedRef],
    );

    useEffect(() => {
      void ensureDefined();
    }, []);

    useEffect(() => {
      if (typeof tiltMax !== 'number') return;
      const el = elementRef.current;
      if (el) el.tiltMax = tiltMax;
    }, [tiltMax]);

    useEffect(() => {
      const el = elementRef.current;
      if (!el) return;
      if (!onLoad && !onError) return;

      const loadHandler = (ev: Event): void => {
        const detail = (ev as CustomEvent<XflipLoadEventDetail>).detail;
        onLoad?.(detail.file);
      };
      const errorHandler = (ev: Event): void => {
        const detail = (ev as CustomEvent<XflipErrorEventDetail>).detail;
        onError?.(detail.error);
      };

      if (onLoad) el.addEventListener('xflip-load', loadHandler);
      if (onError) el.addEventListener('xflip-error', errorHandler);
      return () => {
        if (onLoad) el.removeEventListener('xflip-load', loadHandler);
        if (onError) el.removeEventListener('xflip-error', errorHandler);
      };
    }, [onLoad, onError]);

    // Cast the intrinsic element name through `unknown` to avoid relying on
    // global JSX augmentation being picked up by every downstream tsconfig.
    // Augmentation in `jsx-intrinsic.ts` keeps the *consumer*'s `<xflip-card>`
    // tag typed; here we only need a valid React element.
    const Tag = XFLIP_CARD_TAG as unknown as 'div';

    return (
      <Tag
        ref={setElement as unknown as Ref<HTMLDivElement>}
        {...(src !== undefined ? { src } : {})}
        {...(className !== undefined ? { className } : {})}
        {...(style !== undefined ? { style } : {})}
        {...(id !== undefined ? { id } : {})}
        {...(hidden !== undefined ? { hidden } : {})}
        {...(ariaLabel !== undefined ? { 'aria-label': ariaLabel } : {})}
      />
    );
  },
);
