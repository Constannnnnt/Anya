import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts', 'src/measure.ts'],
  outdir: 'dist',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  splitting: true,
  external: ['yaml', 'marked'],
  sourcemap: false,
  minify: false,
});
