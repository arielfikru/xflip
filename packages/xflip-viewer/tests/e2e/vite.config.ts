import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const pkgRoot = resolve(__dirname, '..', '..');
const coreSrc = resolve(pkgRoot, '..', 'xflip-core', 'src');

/**
 * Vite dev server config dedicated to the Playwright e2e suite.
 *
 * Source-aliased: `@xflip/viewer` and `@xflip/core` resolve to their
 * TypeScript sources, so the e2e fixture page never depends on a prior
 * `pnpm build`. Vite transpiles on the fly. Keeps the e2e loop fast and
 * eliminates a chicken-and-egg between viewer build output and tests.
 */
export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@xflip/viewer/define': resolve(pkgRoot, 'src', 'define.ts'),
      '@xflip/viewer': resolve(pkgRoot, 'src', 'index.ts'),
      '@xflip/core': resolve(coreSrc, 'index.ts'),
    },
  },
  server: {
    port: 5179,
    strictPort: true,
    host: '127.0.0.1',
    fs: {
      allow: [pkgRoot, resolve(pkgRoot, '..')],
    },
  },
});
