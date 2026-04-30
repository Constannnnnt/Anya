import fs from 'fs';
import path from 'path';

function walkFiles(rootDir, predicate) {
    const output = [];
    const stack = [rootDir];
    while (stack.length > 0) {
        const current = stack.pop();
        if (!current || !fs.existsSync(current)) continue;
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
                continue;
            }
            if (predicate(fullPath)) output.push(fullPath);
        }
    }
    return output;
}

function rewriteRelativeSpecifier(filePath, specifier) {
    if (!specifier.startsWith('.')) return specifier;
    if (path.extname(specifier)) return specifier;

    const normalized = specifier.replace(/\/$/, '');
    const base = path.resolve(path.dirname(filePath), normalized);
    if (fs.existsSync(`${base}.d.ts`)) return `${normalized}.js`;
    if (fs.existsSync(`${base}.d.mts`)) return `${normalized}.mjs`;
    if (fs.existsSync(path.join(base, 'index.d.ts'))) return `${normalized}/index.js`;
    if (fs.existsSync(path.join(base, 'index.d.mts'))) return `${normalized}/index.mjs`;
    return specifier;
}

function rewriteRelativeJsSpecifier(filePath, specifier) {
    if (!specifier.startsWith('.')) return specifier;
    if (path.extname(specifier)) return specifier;

    const normalized = specifier.replace(/\/$/, '');
    const base = path.resolve(path.dirname(filePath), normalized);
    if (fs.existsSync(`${base}.js`)) return `${normalized}.js`;
    if (fs.existsSync(`${base}.mjs`)) return `${normalized}.mjs`;
    if (fs.existsSync(path.join(base, 'index.js'))) return `${normalized}/index.js`;
    if (fs.existsSync(path.join(base, 'index.mjs'))) return `${normalized}/index.mjs`;
    return specifier;
}

function fixDtsImports(rootDir) {
    const files = walkFiles(rootDir, (filePath) => filePath.endsWith('.d.ts'));
    const fromRegex = /(from\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;
    const dynamicImportRegex = /(import\s*\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g;

    for (const filePath of files) {
        const original = fs.readFileSync(filePath, 'utf8');
        const next = original
            .replace(fromRegex, (_, prefix, specifier, suffix) => (
                `${prefix}${rewriteRelativeSpecifier(filePath, specifier)}${suffix}`
            ))
            .replace(dynamicImportRegex, (_, prefix, specifier, suffix) => (
                `${prefix}${rewriteRelativeSpecifier(filePath, specifier)}${suffix}`
            ));

        if (next !== original) {
            fs.writeFileSync(filePath, next);
        }
    }
}

function fixJsImports(rootDir) {
    const files = walkFiles(rootDir, (filePath) => filePath.endsWith('.js'));
    const fromRegex = /(from\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;
    const dynamicImportRegex = /(import\s*\(\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"]\s*\))/g;
    const bareImportRegex = /(import\s*['"])(\.{1,2}(?:\/[^'"]*)?)(['"])/g;

    for (const filePath of files) {
        const original = fs.readFileSync(filePath, 'utf8');
        const next = original
            .replace(fromRegex, (_, prefix, specifier, suffix) => (
                `${prefix}${rewriteRelativeJsSpecifier(filePath, specifier)}${suffix}`
            ))
            .replace(dynamicImportRegex, (_, prefix, specifier, suffix) => (
                `${prefix}${rewriteRelativeJsSpecifier(filePath, specifier)}${suffix}`
            ))
            .replace(bareImportRegex, (_, prefix, specifier, suffix) => (
                `${prefix}${rewriteRelativeJsSpecifier(filePath, specifier)}${suffix}`
            ));

        if (next !== original) {
            fs.writeFileSync(filePath, next);
        }
    }
}

function writeCtsDeclaration(entryName) {
    const sourcePath = path.join(process.cwd(), 'dist', `${entryName}.d.ts`);
    const targetPath = path.join(process.cwd(), 'dist-cjs', `${entryName}.d.cts`);
    if (!fs.existsSync(sourcePath)) return;
    fs.copyFileSync(sourcePath, targetPath);
}

// ensure dist directories exist
const distDir = path.join(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
}
const distCjsDir = path.join(process.cwd(), 'dist-cjs');
if (!fs.existsSync(distCjsDir)) {
    fs.mkdirSync(distCjsDir, { recursive: true });
}

const rootCssPath = path.join(process.cwd(), 'index.css');
const rootCssTypesPath = path.join(process.cwd(), 'index.css.d.ts');

fs.copyFileSync(
    path.join(process.cwd(), 'src/index.css'),
    path.join(distDir, 'index.css')
);
fs.copyFileSync(
    path.join(process.cwd(), 'src/index.css'),
    path.join(distCjsDir, 'index.css')
);

// Provide CSS typing for the css subpath export.
fs.writeFileSync(
    path.join(distDir, 'index.css.d.ts'),
    'declare const css: string;\nexport default css;\n'
);
fs.writeFileSync(
    path.join(distCjsDir, 'index.css.d.cts'),
    'declare const cssPath: string;\nexport = cssPath;\n'
);

// CJS bridge: allow require("@anya-ui/react/index.css") to resolve to a file path.
fs.writeFileSync(
    path.join(distCjsDir, 'index.css.cjs'),
    "const path = require('node:path');\nmodule.exports = path.join(__dirname, '..', 'dist', 'index.css');\n"
);

// Node10-style consumers do not read package exports for subpaths, so publish a root shim too.
fs.copyFileSync(
    path.join(process.cwd(), 'src/index.css'),
    rootCssPath
);
fs.writeFileSync(
    rootCssTypesPath,
    'declare const css: string;\nexport default css;\n'
);

// Ensure CommonJS build folder is interpreted correctly under a module package.
fs.writeFileSync(
    path.join(distCjsDir, 'package.json'),
    `${JSON.stringify({ type: 'commonjs' }, null, 2)}\n`
);

fixDtsImports(distDir);
fixJsImports(distDir);
writeCtsDeclaration('index');
