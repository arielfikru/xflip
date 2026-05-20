import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@xflip/core': resolve(here, '../../packages/xflip-core/src/index.ts'),
      '@xflip/viewer': resolve(here, '../../packages/xflip-viewer/src/index.ts'),
    },
  },
  server: {
    port: 5174,
    strictPort: false,
  },
});
