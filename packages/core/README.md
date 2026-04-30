# @anya-ui/core

Core runtime library for Anya UI.

## Install

```bash
npm install @anya-ui/core
```

## Quick Start

```ts
import {
  createAnyaRuntime,
  type AppView,
  type ViewSpec,
  type ViewTemplate,
} from '@anya-ui/core';

const appViews: AppView[] = [
  {
    id: 'orders-main',
    title: 'Orders',
    workflow: 'orders',
    spec: {
      spec_version: 1,
      layout: 'stack',
      components: [],
    },
  },
];

const viewTemplates: ViewTemplate[] = [
  {
    id: 'orders-summary',
    title: 'Orders Summary',
    workflow: 'orders',
    spec: {
      spec_version: 1,
      layout: 'grid',
      components: [],
    },
  },
];

const runtime = createAnyaRuntime({
  components: [],
  workflows: [],
  appViews,
  viewTemplates,
});

const view: ViewSpec = {
  spec_version: 1,
  layout: 'stack',
  components: [],
};

runtime.applyView(view, { source: 'agent' });
runtime.viewRegistry.listAppViews();
void runtime.viewRecommendations?.forView({
  id: 'orders-main',
  kind: 'app',
  workflow: 'orders',
});
```

## Public API Groups

- Components and workflows
- Views, app views, templates, and actions
- Shared state
- Runtime and events
- Memory and profile
- View recommendations from measured interaction behavior
- View change review/apply helpers for durable app views and templates
- Quality gate helpers
- Session artifact helpers

The main entrypoint is view-first. Legacy `presentation` names are no longer exported from `@anya-ui/core`.

The stable/experimental package boundary is documented in:

- `docs/package-boundaries.md`

## Advanced Usage

```ts
import { setIdGenerator } from '@anya-ui/core';

let sequence = 0;
setIdGenerator((prefix) => `${prefix}-det-${++sequence}`);
```

## Experimental APIs

UI memory pipeline APIs are exported from:

```ts
import { UiMemoryPipeline } from '@anya-ui/core/experimental';
```

Experimental exports may change between minor releases.

## Transport Adapters

If you are integrating an external agent runtime, prefer `@anya-ui/adapters` for transport builders and canonical artifact/event helpers instead of writing `AgentSessionTransport` objects by hand.

## Benchmark

```bash
npm run bench --workspace @anya-ui/core
```

## Troubleshooting

- If ATTW fails only on `node10` entrypoints, run it with `--profile node16` for the supported Node policy (`>=18`).
- If CJS consumers report type mismatches, ensure `dist-cjs/*.d.cts` files are present after `npm run build`.

