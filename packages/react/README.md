# @anya-ui/react

React bindings for Anya UI (`Provider`, hooks, view renderers, primitives).

## Install

```bash
npm install @anya-ui/react @anya-ui/core react react-dom
```

## Quick Start

```tsx
import { AnyaProvider, ViewRenderer, builtInPrimitives } from '@anya-ui/react';
import type { ViewSpec } from '@anya-ui/core';

const view: ViewSpec = {
  spec_version: 1,
  layout: 'stack',
  components: [
    { id: 'h1', type: 'Heading', props: { text: 'Hello' } },
  ],
};

export function App() {
  return (
    <AnyaProvider components={builtInPrimitives}>
      <ViewRenderer spec={view} />
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
import { defineComponent, useAnya } from '@anya-ui/react';
import { z } from 'zod';

const Banner = defineComponent({
  name: 'Banner',
  description: 'Simple hero banner',
  propsSchema: z.object({ text: z.string() }),
  render: ({ props }) => <div>{props.text}</div>,
});

function Example() {
  const anya = useAnya();
  const prompt = anya.agent.buildPrompt();
  anya.state.setValue('filters', 'query.text', 'adaptive ui');
  anya.view.registerApp({
    id: 'profile-main',
    title: 'Profile',
    workflow: 'profile',
    spec: {
      layout: 'stack',
      components: [{ id: 'h1', type: 'Banner', props: { text: 'Profile' } }],
    },
  });
  anya.view.saveAsTemplate({
    id: 'profile-template',
    title: 'Profile Template',
  });
  return <pre>{prompt}</pre>;
}
```

`useAnyaUI()` is also view-first now, using names like `viewState`, `planView()`, and `applyViewPlan()`.

For most app code, prefer `useAnya()` and treat `useAnyaUI()` as the advanced low-level hook.

The package boundary is documented in:

- `docs/package-boundaries.md`

## Session Views

```tsx
function SessionExample() {
  const anya = useAnya();

  async function run() {
    const completed = await anya.agent.runSession({
      userIntent: 'Build an order summary',
      messages: [],
      savePrimaryViewAsTemplate: {
        id: 'order-summary-template',
        title: 'Order Summary Template',
      },
    });

    console.log(completed.primaryViewSpec);
  }

  return <button onClick={run}>Run</button>;
}
```

For external session runtimes, build the transport with `@anya-ui/adapters` and pass it to `anya.agent.runSession(...)`.

## Current View Recommendations

```tsx
function ViewRecommendationsExample() {
  const anya = useAnya();

  async function inspect() {
    const recommendations = await anya.viewRecommendations.forCurrentView();
    console.log(recommendations);
  }

  return <button onClick={inspect}>Inspect Current View</button>;
}
```

## Review And Apply View Changes

```tsx
function ReviewExample({ recommendation }: { recommendation: Awaited<ReturnType<ReturnType<typeof useAnya>['viewRecommendations']['forCurrentView']>>[number] }) {
  const anya = useAnya();

  async function reviewAndApply() {
    const { draft } = await anya.viewChanges.createFromRecommendation(recommendation);
    const reviewed = anya.viewChanges.review(draft, {
      decision: 'accepted',
      reviewer: 'design-review',
    });
    anya.viewChanges.applyToApp(reviewed, {
      openAfterApply: true,
    });
  }

  return <button onClick={reviewAndApply}>Approve Change</button>;
}
```

## Security Defaults

- URL-bearing primitives sanitize unsafe URLs to `about:blank`.
- `Iframe` uses restrictive default `allow`, `sandbox`, and `referrerPolicy`.

## Troubleshooting

- If styles are missing, verify `import '@anya-ui/react/index.css'` is loaded once at app root.
- For CommonJS consumers, `require('@anya-ui/react/index.css')` resolves to a CSS file path string.
