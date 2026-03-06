import { execFileSync } from 'node:child_process';

const DEFAULT_BASE_BRANCH = 'main';
const rootRef = process.argv[2] || (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : `origin/${DEFAULT_BASE_BRANCH}`);

function runGit(args) {
  return execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function parseChangedFiles(output) {
  return output.length === 0 ? [] : output.split(/\r?\n/).filter(Boolean);
}

function getChangedFiles(baseRef) {
  const comparedToBase = parseChangedFiles(runGit(['diff', '--name-only', '--diff-filter=ACMR', `${baseRef}...HEAD`]));
  const staged = parseChangedFiles(runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR']));
  const unstaged = parseChangedFiles(runGit(['diff', '--name-only', '--diff-filter=ACMR']));
  const untracked = parseChangedFiles(runGit(['ls-files', '--others', '--exclude-standard']));
  return Array.from(new Set([...comparedToBase, ...staged, ...unstaged, ...untracked]));
}

function isChangesetFile(filePath) {
  return /^\.changeset\/(?!README\.md$|config\.json$).+\.md$/.test(filePath);
}

function isReleaseRelevantPackageChange(filePath) {
  const match = /^packages\/[^/]+\/(.+)$/.exec(filePath);
  if (!match) {
    return false;
  }

  const relativePath = match[1];

  if (relativePath === 'package.json') {
    return true;
  }

  if (/^tsconfig(?:\.[^/]+)?\.json$/.test(relativePath)) {
    return true;
  }

  if (relativePath.startsWith('src/')) {
    return true;
  }

  if (relativePath.startsWith('scripts/')) {
    return true;
  }

  return false;
}

try {
  const changedFiles = getChangedFiles(rootRef);
  const releaseRelevantFiles = changedFiles.filter(isReleaseRelevantPackageChange);
  const changesetFiles = changedFiles.filter(isChangesetFile);

  if (releaseRelevantFiles.length === 0) {
    console.log(`changeset check: no release-relevant package changes detected against ${rootRef}`);
    process.exit(0);
  }

  if (changesetFiles.length > 0) {
    console.log(`changeset check: found ${changesetFiles.length} changeset file(s) for release-relevant changes`);
    process.exit(0);
  }

  console.error(`changeset check failed: release-relevant package changes were detected against ${rootRef} without a changeset.`);
  console.error('');
  console.error('Changed files requiring semver review:');
  for (const filePath of releaseRelevantFiles) {
    console.error(`- ${filePath}`);
  }
  console.error('');
  console.error('Run `npm run changeset` and commit the generated `.changeset/*.md` file, or move the change out of the release-relevant paths if it is internal-only.');
  process.exit(1);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`changeset check failed to inspect git diff against ${rootRef}: ${message}`);
  process.exit(1);
}
