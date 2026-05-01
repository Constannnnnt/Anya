import esbuild from 'esbuild';
import { promises as fs } from 'fs';
import path from 'path';

async function walk(dir, callback) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stats = await fs.stat(filepath);
    if (stats.isDirectory()) {
      await walk(filepath, callback);
    } else if (stats.isFile()) {
      await callback(filepath);
    }
  }
}

async function minifyFiles(dir) {
  console.log(`Minifying files in ${dir}...`);
  await walk(dir, async (filepath) => {
    if (filepath.endsWith('.js') || filepath.endsWith('.cjs')) {
      // Check if it's already minified (optional)
      const content = await fs.readFile(filepath, 'utf8');
      
      const result = await esbuild.transform(content, {
        minify: true,
        target: 'es2020',
        loader: 'js',
      });

      await fs.writeFile(filepath, result.code);
    }
  });
}

async function main() {
  const targets = ['dist', 'dist-cjs'];
  for (const target of targets) {
    const targetPath = path.resolve(process.cwd(), target);
    try {
      await fs.access(targetPath);
      await minifyFiles(targetPath);
    } catch (e) {
      console.warn(`Skipping ${target}: Directory not found.`);
    }
  }
  console.log('Minification complete.');
}

main().catch(err => {
  console.error('Minification failed:', err);
  process.exit(1);
});
