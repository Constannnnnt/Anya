# Anya UI

Anya UI is a TypeScript framework for generative, agent-driven UI composition.

This repository is a workspace with:
- `@anya-ui/core`: runtime, orchestration, memory, presentation planning.
- `@anya-ui/react`: React provider, hooks, adaptive renderer, primitives.

## Compatibility

- Node: `>=18`
- Package manager: `npm@10.9.2`
- Module format: ESM + CJS dual publish

## Install

```bash
npm ci
```

## Workspace Commands

```bash
npm run lint
npm run test
npm run build
```

## Packaging Checks

```bash
npx -y publint@0.3.18 packages/core
npx -y publint@0.3.18 packages/react
cd packages/core && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
cd packages/react && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
npm audit --omit=dev
npm pack --dry-run --json --workspace @anya-ui/core
npm pack --dry-run --json --workspace @anya-ui/react
```

## Release Flow

1. Capture semver impact: `npm run changeset`.
2. Version packages: `npm run version-packages`.
3. Run full validation (`lint`, `test`, `build`, `publint`, `arethetypeswrong`, `npm pack --dry-run`).
4. Publish first with `next` tag.
5. Promote to `latest` after smoke validation.

See:
- [CONTRIBUTING.md](./CONTRIBUTING.md)
- [SECURITY.md](./SECURITY.md)
- [CHANGELOG.md](./CHANGELOG.md)
