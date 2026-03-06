# @anya-ui/core

Core runtime and orchestration library for Anya UI.

## Install

```bash
npm install @anya-ui/core
```

## Quick Start

```ts
import { createAnyaKernel, type UIRenderSpec } from '@anya-ui/core';

const kernel = createAnyaKernel({
  components: [],
  workflowContexts: [],
});

const spec: UIRenderSpec = {
  spec_version: 1,
  layout: 'stack',
  components: [],
};

kernel.applySpec(spec, { source: 'agent' });
```

## Public API Groups

- Runtime and events
- Translator encode/decode
- Presentation planning and application
- Kernel/orchestrator integration
- Quality gate helpers

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

## Benchmark

```bash
npm run bench --workspace @anya-ui/core
```

## Troubleshooting

- If ATTW fails only on `node10` entrypoints, run it with `--profile node16` for the supported Node policy (`>=18`).
- If CJS consumers report type mismatches, ensure `dist-cjs/*.d.cts` files are present after `npm run build`.
