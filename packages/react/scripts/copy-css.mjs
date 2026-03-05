import fs from 'fs';
import path from 'path';

// ensure dist directory exists
const distDir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}

fs.copyFileSync(
    path.join(process.cwd(), 'src/index.css'),
    path.join(distDir, 'index.css')
);
console.log('Copied src/index.css to dist/index.css');
