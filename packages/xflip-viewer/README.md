# @xflip/viewer

Web Component `<xflip-card>` for rendering [xflip](../../README.md) image files in the browser.

> **Status:** Phase P3 in progress. The custom element shell is in place;
> fetch, decode, and rendering land in later P3 tasks. Not yet usable for
> rendering real cards.

## Install

```sh
pnpm add @xflip/viewer
```

The element does **not** auto-register on import. Pick one of:

```ts
// Side-effect import — registers <xflip-card>.
import '@xflip/viewer/define';
```

```ts
// Or register manually (optionally under a custom tag).
import { defineXflipCard } from '@xflip/viewer';
defineXflipCard();
```

## Usage

```html
<xflip-card src="./hero.xflip"></xflip-card>
```

### Styling

The element exposes CSS custom properties and shadow parts:

| CSS variable          | Default     | Purpose                       |
| --------------------- | ----------- | ----------------------------- |
| `--xflip-width`       | `240px`     | Element width                 |
| `--xflip-aspect-ratio`| `5 / 7`     | Card aspect ratio             |
| `--xflip-status-color`| `#888`      | Color of loading/error status |

| Shadow part | Purpose                                |
| ----------- | -------------------------------------- |
| `stage`     | Inner rendering surface                |
| `status`    | Live region for loading/error messages |

## API

### `XflipCardElement`

The custom element constructor. Extends `HTMLElement`.

- `static register(tagName?: string): void` — register under the given tag
  (default `xflip-card`). Idempotent; throws if the tag is taken by a
  different constructor.
- `get file: XflipFile | null` — the decoded file once loaded.
- `src` — getter/setter that mirrors the `src` attribute.

### `defineXflipCard(tagName?: string): void`

Convenience wrapper around `XflipCardElement.register`.

### `XFLIP_CARD_TAG`

The default tag name constant (`'xflip-card'`).

## License

MIT
