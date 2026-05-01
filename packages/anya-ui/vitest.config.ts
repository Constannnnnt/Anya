import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/react/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
  resolve: {
    alias: {
      'anya-ui/core/internal': resolve(__dirname, './src/core/internal.ts'),
      'anya-ui/core': resolve(__dirname, './src/core/index.ts'),
      'anya-ui/react': resolve(__dirname, './src/react/index.ts'),
      'anya-ui/adapters': resolve(__dirname, './src/adapters/index.ts'),
      'anya-ui': resolve(__dirname, './src/index.ts'),
    },
  },
});
