# Contributing

## Prerequisites

- Node `>=18`
- npm `>=10`

## Setup

```bash
npm ci
```

## Required Checks Before PR

```bash
npm run lint
npm run test
npm run build
npx -y publint@0.3.18 packages/core
npx -y publint@0.3.18 packages/react
cd packages/core && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
cd packages/react && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
npm audit --omit=dev
```

## Commit and Release Discipline

- Keep changes scoped and semver-aware.
- Use `npm run changeset` for any user-visible change in `@anya-ui/core` or `@anya-ui/react`.
- Public API changes require docs updates and changelog entries.
- Experimental APIs must go under explicit experimental entrypoints.

## Pull Request Expectations

- Include tests for behavior changes.
- Include migration notes for any breaking API change.
- Keep package metadata and export maps consistent across `core` and `react`.
