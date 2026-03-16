import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootNodeModules = path.resolve(__dirname, '../../node_modules');

export default defineConfig({
  resolve: {
    // Force a single React runtime in tests to avoid invalid hook calls.
    alias: {
      '@anya-ui/core': path.resolve(__dirname, '../core/src/index.ts'),
      react: path.join(rootNodeModules, 'react'),
      'react-dom': path.join(rootNodeModules, 'react-dom'),
      'react/jsx-runtime': path.join(rootNodeModules, 'react/jsx-runtime.js'),
      'react/jsx-dev-runtime': path.join(rootNodeModules, 'react/jsx-dev-runtime.js'),
    },
    dedupe: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, './vitest.setup.ts')],
    globals: true,
    server: {
      deps: {
        // Inline React stack so Vitest doesn't split React into different runtimes.
        inline: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', '@testing-library/react'],
      },
    },
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: ['react', 'react-dom', '@testing-library/react'],
        },
      },
    },
  },
});
