# Anya UI

Anya UI is a TypeScript framework for adaptive interfaces, where agents can generate views, update persistent app views, and optimize workflows from memory and interaction patterns.

This repository is a workspace with:
- `@anya-ui/core`: catalog, view specs, runtime, memory, optimization contracts.
- `@anya-ui/react`: React provider, generated/app view runtime, hooks, primitives.
- `@anya-ui/adapters`: transport adapters, session event builders, and artifact builders.

## Architecture

The current implemented architecture, data flows, and finite roadmap are documented in [docs/current-architecture-and-roadmap.md](./docs/current-architecture-and-roadmap.md).
The intended simplification direction is documented in [docs/architecture-redraft.md](./docs/architecture-redraft.md).
The naming and design-pattern decisions are documented in [docs/naming-and-patterns.md](./docs/naming-and-patterns.md).
The public package boundary is documented in [docs/package-boundaries.md](./docs/package-boundaries.md).

The short version:

- `catalog`: define guarded components and tools
- `views`: support generated UI, persistent app UI, and reusable view templates
- `state`: keep generated and app views synchronized through a shared state graph
- `memory`: retain task, user, view, and optimization memory
- `optimization`: improve interfaces safely from interaction patterns and rollout policies
- `adapters`: connect Anya to agent runtimes, MCP, and event protocols

Current implementation focus:

- generated views, app views, and reusable view templates
- a shared state graph for live view data
- session artifacts that resolve into first-class view results
- ranked `viewRecommendations` APIs that turn behavior signals into concrete UI suggestions
- view change APIs that turn recommendation-driven revision runs into previewable drafts, review decisions, and durable app/template updates
- adapter utilities that turn external agent runtimes into stable `AgentSessionTransport` implementations
- view-first public APIs in `@anya-ui/core` and `@anya-ui/react`, with legacy `presentation` exports removed from the main entrypoints
- Stage 5 stabilization completed: direct public APIs, modularized React hook internals, and removal of transition-focused cleanup docs

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
npx -y publint@0.3.18 packages/adapters
npx -y publint@0.3.18 packages/core
npx -y publint@0.3.18 packages/react
cd packages/adapters && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
cd packages/core && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
cd packages/react && npx -y @arethetypeswrong/cli@0.18.2 --pack . --profile node16 && cd ../..
npm audit --omit=dev
npm pack --dry-run --json --workspace @anya-ui/adapters
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
