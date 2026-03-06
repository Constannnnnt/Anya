import { readdirSync } from 'node:fs';
import path from 'node:path';

const changesetDir = path.join(process.cwd(), '.changeset');
const ignoredFiles = new Set(['README.md', 'config.json']);

const pendingChangesets = readdirSync(changesetDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name)
  .filter((name) => name.endsWith('.md') && !ignoredFiles.has(name));

if (pendingChangesets.length > 0) {
  console.error('release check failed: unreleased changeset files are still present.');
  console.error('');
  for (const name of pendingChangesets) {
    console.error(`- .changeset/${name}`);
  }
  console.error('');
  console.error('Run `npm run version-packages`, commit the resulting package/changelog changes, and publish from that versioned commit.');
  process.exit(1);
}

console.log('release check: no pending changeset files found');
