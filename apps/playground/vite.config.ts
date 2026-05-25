import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Pull workspace deps from source so HMR works edge-to-edge.
    alias: {
      '@xflip/core': resolve(here, '../../packages/xflip-core/src/index.ts'),
      '@xflip/viewer': resolve(here, '../../packages/xflip-viewer/src/index.ts'),
      '@xflip/react': resolve(here, '../../packages/xflip-react/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.XFLIP_API_URL ?? 'http://localhost:8787',
        changeOrigin: true,
      },
    },
  },
});
