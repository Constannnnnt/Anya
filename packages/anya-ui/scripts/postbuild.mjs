import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const distDir = path.join(cwd, 'dist');
const distCjsDir = path.join(cwd, 'dist-cjs');

function walkFiles(rootDir, predicate) {
  const output = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (predicate(fullPath)) {
        output.push(fullPath);
      }
    }
  }
  return output;
}

function rewriteRelativeSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  if (path.extname(specifier)) return specifier;

  const normalized = specifier.replace(/\/$/, '');
  const base = path.resolve(path.dirname(filePath), normalized);
  const dtsFile = `${base}.d.ts`;
  const dMtsFile = `${base}.d.mts`;
  const dtsIndex = path.join(base, 'index.d.ts');
  const dMtsIndex = path.join(base, 'index.d.mts');

  if (fs.existsSync(dtsFile)) return `${normalized}.js`;
  if (fs.existsSync(dMtsFile)) return `${normalized}.mjs`;
  if (fs.existsSync(dtsIndex)) return `${normalized}/index.js`;
  if (fs.existsSync(dMtsIndex)) return `${normalized}/index.mjs`;
  return specifier;
}

function rewriteRelativeJsSpecifier(filePath, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  if (path.extname(specifier)) return specifier;

  const normalized = specifier.replace(/\/$/, '');
  const base = path.resolve(path.dirname(filePath), normalized);
  const jsFile = `${base}.js`;
  const mjsFile = `${base}.mjs`;
  const jsIndex = path.join(base, 'index.js');
  const mjsIndex = path.join(base, 'index.mjs');

  if (fs.existsSync(jsFile)) return `${normalized}.js`;
  if (fs.existsSync(mjsFile)) return `${normalized}.mjs`;
  if (fs.existsSync(jsIndex)) return `${normalized}/index.js`;
  if (fs.existsSync(mjsIndex)) return `${normalized}/index.mjs`;
  return specifier;
}

function fixDtsImports(rootDir) {
  const dtsFiles = walkFiles(rootDir, (filePath) => filePath.endsWith('.d.ts'));
  const fromRegex = /(from\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;
  const dynamicImportRegex = /(import\s*\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g;

  for (const dtsFile of dtsFiles) {
    const original = fs.readFileSync(dtsFile, 'utf8');
    const next = original
      .replace(fromRegex, (_, prefix, specifier, suffix) => {
        return `${prefix}${rewriteRelativeSpecifier(dtsFile, specifier)}${suffix}`;
      })
      .replace(dynamicImportRegex, (_, prefix, specifier, suffix) => {
        return `${prefix}${rewriteRelativeSpecifier(dtsFile, specifier)}${suffix}`;
      });

    if (next !== original) {
      fs.writeFileSync(dtsFile, next);
    }
  }
}

function fixJsImports(rootDir) {
  const jsFiles = walkFiles(rootDir, (filePath) => filePath.endsWith('.js'));
  const fromRegex = /(from\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;
  const dynamicImportRegex = /(import\s*\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g;
  const bareImportRegex = /(import\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;

  for (const jsFile of jsFiles) {
    const original = fs.readFileSync(jsFile, 'utf8');
    const next = original
      .replace(fromRegex, (_, prefix, specifier, suffix) => {
        return `${prefix}${rewriteRelativeJsSpecifier(jsFile, specifier)}${suffix}`;
      })
      .replace(dynamicImportRegex, (_, prefix, specifier, suffix) => {
        return `${prefix}${rewriteRelativeJsSpecifier(jsFile, specifier)}${suffix}`;
      })
      .replace(bareImportRegex, (_, prefix, specifier, suffix) => {
        return `${prefix}${rewriteRelativeJsSpecifier(jsFile, specifier)}${suffix}`;
      });

    if (next !== original) {
      fs.writeFileSync(jsFile, next);
    }
  }
}

function writeCtsDeclaration(entryName) {
  const sourcePath = path.join(distDir, `${entryName}.d.ts`);
  const targetPath = path.join(distCjsDir, `${entryName}.d.cts`);
  if (!fs.existsSync(sourcePath)) return;
  fs.copyFileSync(sourcePath, targetPath);
}

function writeExperimentalCompatShim() {
  const jsTarget = path.join(cwd, 'experimental.js');
  const dtsTarget = path.join(cwd, 'experimental.d.ts');

  fs.writeFileSync(
    jsTarget,
    "module.exports = require('./dist-cjs/experimental.js');\n",
  );
  fs.writeFileSync(
    dtsTarget,
    "export * from './dist/experimental.js';\n",
  );
}

function copyAssets(rootDir, targetDir, extension) {
  const assets = walkFiles(rootDir, (filePath) => filePath.endsWith(extension));
  for (const asset of assets) {
    const relative = path.relative(rootDir, asset);
    const target = path.join(targetDir, relative);
    const targetFolder = path.dirname(target);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    fs.copyFileSync(asset, target);
  }
}

if (!fs.existsSync(distCjsDir)) {
  fs.mkdirSync(distCjsDir, { recursive: true });
}

fs.writeFileSync(
  path.join(distCjsDir, 'package.json'),
  `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`,
);

const srcDir = path.join(cwd, 'src');
copyAssets(srcDir, distDir, '.css');
copyAssets(srcDir, distCjsDir, '.css');

fixDtsImports(distDir);
fixJsImports(distDir);
writeCtsDeclaration('index');
writeCtsDeclaration('core/index');
writeCtsDeclaration('react/index');
writeCtsDeclaration('adapters/index');
writeCtsDeclaration('experimental');
writeExperimentalCompatShim();
