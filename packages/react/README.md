# @anya-ui/react

React bindings for Anya UI (`Provider`, hooks, adaptive renderer, primitives).

## Install

```bash
npm install @anya-ui/react @anya-ui/core react react-dom
```

## Quick Start

```tsx
import { AnyaProvider, AdaptiveRenderer, builtInPrimitives } from '@anya-ui/react';
import type { UIRenderSpec } from '@anya-ui/core';

const spec: UIRenderSpec = {
  spec_version: 1,
  layout: 'stack',
  components: [
    { id: 'h1', type: 'Heading', props: { text: 'Hello' } },
  ],
};

export function App() {
  return (
    <AnyaProvider components={builtInPrimitives}>
      <AdaptiveRenderer spec={spec} />
    </AnyaProvider>
  );
}
```

## Styling

```ts
import '@anya-ui/react/index.css';
```

## Advanced Usage

```tsx
import { defineComponent } from '@anya-ui/react';
import { z } from 'zod';

const Banner = defineComponent({
  name: 'Banner',
  description: 'Simple hero banner',
  propsSchema: z.object({ text: z.string() }),
  render: ({ props }) => <div>{props.text}</div>,
});
```

## Security Defaults

- URL-bearing primitives sanitize unsafe URLs to `about:blank`.
- `Iframe` uses restrictive default `allow`, `sandbox`, and `referrerPolicy`.

## Troubleshooting

- If styles are missing, verify `import '@anya-ui/react/index.css'` is loaded once at app root.
- For CommonJS consumers, `require('@anya-ui/react/index.css')` resolves to a CSS file path string.
