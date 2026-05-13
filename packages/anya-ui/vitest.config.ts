import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
  },
  resolve: {
    alias: {
      'anya-ui': resolve(__dirname, './src/index.ts'),
    },
  },
});
