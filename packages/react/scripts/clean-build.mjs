import { rmSync } from 'fs';
import { resolve } from 'path';

const root = resolve(import.meta.dirname, '..');

for (const dir of ['dist', 'dist-cjs']) {
  rmSync(resolve(root, dir), { recursive: true, force: true });
}
