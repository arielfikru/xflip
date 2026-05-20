import { decode, type XflipFile } from '@xflip/core';
import { useEffect, useState } from 'react';

/**
 * Discriminated status of a {@link useXflip} request.
 *
 * - `idle`: no `src` provided.
 * - `loading`: fetch/decode in flight.
 * - `success`: `file` is populated with the decoded `.xflip`.
 * - `error`: `error` holds the thrown reason.
 */
export type XflipStatus = 'idle' | 'loading' | 'success' | 'error';

/**
 * Result of {@link useXflip}.
 *
 * Exactly one of `file` / `error` is non-null when `status` is `success` /
 * `error`; both are `null` while `idle` or `loading`.
 */
export interface UseXflipResult {
  file: XflipFile | null;
  error: Error | null;
  status: XflipStatus;
}

const IDLE: UseXflipResult = { file: null, error: null, status: 'idle' };

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(String(reason));
}

/**
 * Fetch and decode an `.xflip` file by URL.
 *
 * The hook is SSR-safe: no `fetch` or `window` access happens at module
 * scope, and the effect short-circuits when `src` is `undefined`. An
 * `AbortController` cancels the in-flight request when `src` changes or
 * the consumer unmounts.
 *
 * @example
 * ```tsx
 * function Card({ src }: { src: string }) {
 *   const { file, error, status } = useXflip(src);
 *   if (status === 'loading') return <Spinner />;
 *   if (status === 'error') return <p>{error?.message}</p>;
 *   if (status === 'success') return <pre>{file?.head.version}</pre>;
 *   return null;
 * }
 * ```
 */
export function useXflip(src: string | undefined): UseXflipResult {
  const [state, setState] = useState<UseXflipResult>(IDLE);

  useEffect(() => {
    if (src === undefined) {
      setState(IDLE);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    setState({ file: null, error: null, status: 'loading' });

    (async () => {
      try {
        const response = await fetch(src, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${src}: ${response.status} ${response.statusText}`);
        }
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (cancelled) return;
        const file = decode(bytes);
        if (cancelled) return;
        setState({ file, error: null, status: 'success' });
      } catch (reason) {
        if (cancelled) return;
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        setState({ file: null, error: toError(reason), status: 'error' });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [src]);

  return state;
}
