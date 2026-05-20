# @xflip/react

React wrapper around the [`<xflip-card>`](../xflip-viewer/README.md) web
component for rendering [xflip](../../README.md) image files in React apps.

> **Status:** Phase P5 in progress. The `<XflipCard>` wrapper and
> `useXflip` hook ship; SSR-safe import is verified.

## Install

```sh
pnpm add @xflip/react react
```

`react >= 18` is required (peer dependency). `react-dom` is needed
transitively by the app, not by this package.

## SSR safety

`@xflip/react` imports cleanly under Node — no `HTMLElement`,
`document`, or `customElements` access happens at module top-level. The
underlying `@xflip/viewer` module (which defines a class that extends
`HTMLElement`) is loaded lazily via `await import(...)` inside the mount
effect, so SSR frameworks like Next.js, Remix, and Astro will not blow
up at server-render time.

## `<XflipCard>`

A typed React wrapper around `<xflip-card>`. The first time any
`<XflipCard>` mounts on the client, the wrapper registers the custom
element with `customElements.define('xflip-card', XflipCardElement)`.
Registration is idempotent.

```tsx
import { XflipCard } from '@xflip/react';

export function Hero() {
  return (
    <XflipCard
      src="/hero.xflip"
      tiltMax={12}
      onLoad={(file) => console.log('decoded', file)}
      onError={(err) => console.error(err)}
    />
  );
}
```

### Props

| Prop              | Type                              | Notes                                              |
| ----------------- | --------------------------------- | -------------------------------------------------- |
| `src`             | `string`                          | URL of an `.xflip` file. Maps to the `src` attribute. |
| `tiltMax`         | `number`                          | Pointer tilt magnitude in degrees. `0` disables tilt. Applied as a property. |
| `onLoad`          | `(file: XflipFile) => void`       | Subscribes to the `xflip-load` event.              |
| `onError`         | `(error: Error) => void`          | Subscribes to the `xflip-error` event.             |
| `className`       | `string`                          | Forwarded to the host element.                     |
| `style`           | `CSSProperties`                   | Forwarded to the host element.                     |
| `id`              | `string`                          | Forwarded to the host element.                     |
| `hidden`          | `boolean`                         | Forwarded to the host element.                     |
| `aria-label`      | `string`                          | Forwarded to the host element.                     |

### Forwarded ref

Forward a ref to access the underlying `XflipCardElement` (e.g. to call
`enableGyroscope()`, `toggleFace()`, or read decoded data).

```tsx
import { useRef } from 'react';
import { XflipCard, type XflipCardElement } from '@xflip/react';

function GyroCard() {
  const ref = useRef<XflipCardElement | null>(null);

  return (
    <>
      <XflipCard ref={ref} src="/foil.xflip" />
      <button onClick={() => ref.current?.enableGyroscope()}>
        Enable tilt
      </button>
    </>
  );
}
```

### Using the raw `<xflip-card>` tag

Importing `@xflip/react` augments the JSX namespace so the raw custom
element tag is typed:

```tsx
import '@xflip/react'; // augments JSX.IntrinsicElements

function Raw() {
  return <xflip-card src="/raw.xflip" />;
}
```

## `useXflip(src)`

A hook that fetches and decodes an `.xflip` file. Returns a
discriminated state machine.

```tsx
import { useXflip } from '@xflip/react';

function CardInfo({ src }: { src: string }) {
  const { file, error, status } = useXflip(src);

  if (status === 'loading') return <p>Loading…</p>;
  if (status === 'error') return <p>Failed: {error?.message}</p>;
  if (status === 'success') {
    return (
      <p>
        {file?.head.width}×{file?.head.height} ·{' '}
        v{file?.versionMajor}.{file?.versionMinor}
      </p>
    );
  }
  return null;
}
```

### Return value

```ts
type XflipStatus = 'idle' | 'loading' | 'success' | 'error';

interface UseXflipResult {
  file: XflipFile | null;
  error: Error | null;
  status: XflipStatus;
}
```

- `idle`: `src` is `undefined`.
- `loading`: fetch / decode in flight.
- `success`: `file` is populated.
- `error`: `error` holds the thrown reason. `AbortError` from a
  cancelled in-flight request is **not** surfaced as `error`.

An `AbortController` cancels the in-flight request when `src` changes
or the consumer unmounts.

## License

MIT
