import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';

export default defineConfig({
  build: {
    target: 'es2022',
    sourcemap: true,
    minify: false,
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        define: resolve(__dirname, 'src/define.ts'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@xflip/core'],
      output: {
        preserveModules: false,
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
      },
    },
  },
  plugins: [
    dts({
      entryRoot: 'src',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      rollupTypes: false,
    }),
  ],
  test: {
    environment: 'happy-dom',
  },
});
