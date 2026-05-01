import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(process.cwd(), 'src');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      walk(filePath, callback);
    } else if (stats.isFile() && (file.endsWith('.ts') || file.endsWith('.tsx'))) {
      callback(filePath);
    }
  }
}

const REPLACEMENTS = [
  // Fix broken syntax from corrupted unicode
  { from: /\ufffd?\/span>/g, to: '</span>' },
  { from: /\ufffd?'/g, to: "'" },
  { from: /\ufffd?"/g, to: '"' },
  { from: /\ufffd?\s*}/g, to: ' }' },
  { from: /'\ufffd?\s*,/g, to: "'," },
  { from: /:\s*'\ufffd?\s*}/g, to: ": '' }" },
  { from: /placeholder=\{props\.placeholder \?\? 'Search\ufffd?\}/g, to: "placeholder={props.placeholder ?? 'Search'}" },
  
  // Fix general corruption in comments and logs
  { from: /\ufffd+/g, to: ' - ' },
  
  // Final nomenclature check (just in case)
  { from: /componentName/g, to: 'nodeType' },
  { from: /elementId/g, to: 'nodeId' },
  { from: /ComponentCapability/g, to: 'NodeCapability' },
  { from: /UIRenderSpec/g, to: 'ViewSpec' },
  { from: /ViewComponentSlots/g, to: 'ViewNodeSlots' },
  { from: /projectionComponents/g, to: 'projectionNodes' },
];

walk(srcDir, (filePath) => {
  let content = fs.readFileSync(filePath, 'utf8');
  let changed = false;

  for (const { from, to } of REPLACEMENTS) {
    if (from.test(content)) {
      content = content.replace(from, to);
      changed = true;
    }
  }

  if (changed) {
    console.log(`Fixed: ${filePath}`);
    fs.writeFileSync(filePath, content, 'utf8');
  }
});

console.log('Cleanup complete.');
