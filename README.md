# Anya UI

> Generative, adaptive interfaces for TypeScript and React. Build apps where an agent assembles the UI from registered components and the interface tunes itself to how each user actually works.

Anya UI is a single TypeScript package that gives you three things:

1. **Generative views** — describe your components once with `defineComponent`; an LLM agent assembles them into UIs in response to user intent.
2. **A measured behaviour pipeline** — every interaction is collected, projected through ten classical HCI heuristics (Fitts's Law, Hick-Hyman, KLM, Steering Law, Form Friction, etc.), and fused into four composite friction scores per task context.
3. **A closed-loop recommendation system** — the framework proposes UI changes when friction is high, attributes outcomes after the change is applied, and biases future suggestions by what actually worked.

You write components. The agent writes views. The framework watches what happens and gets better at proposing changes.

```bash
npm install anya-ui
```

```tsx
import { AnyaProvider, defineComponent, useAnyaUI, AdaptiveRenderer } from 'anya-ui/react';
import { createAgentSessionTransport } from 'anya-ui/adapters';
import { z } from 'zod';

const Heading = defineComponent({
  name: 'Heading',
  description: 'A semantic heading',
  propsSchema: z.object({ text: z.string(), level: z.number().int().min(1).max(6) }),
  render: ({ props }) => React.createElement(`h${props.level}`, null, props.text),
});

const transport = createAgentSessionTransport(async (input) => {
  // Call your LLM with input.systemPrompt + input.messages.
  // Emit session events. See docs/getting-started.md.
  return { events: yourEventStream };
});

function App() {
  const ui = useAnyaUI();
  return (
    <>
      <button onClick={() => ui.runAgentSession({
        userIntent: 'Welcome the user',
        messages: [],
        transport,
      })}>Generate</button>
      {ui.viewState.spec && <AdaptiveRenderer viewSpec={ui.viewState.spec} />}
    </>
  );
}

export default function Root() {
  return (
    <AnyaProvider nodes={[Heading]}>
      <App />
    </AnyaProvider>
  );
}
```

## Documentation

| Guide | What's inside |
|---|---|
| [**Getting Started**](./docs/getting-started.md) | Install, set up the Provider, register a component, plug in an LLM transport, render your first generated view. |
| [**Concepts**](./docs/concepts.md) | `ViewSpec`, `Node`, `Skill`, `Memory`, `Behavior pipeline`, `Recommendation`, `View change draft`. |
| [**Adaptive Behavior**](./docs/adaptive-behavior.md) | The HCI heuristics layer, composite scores, outcome loop, calibration harness — how to actually use the adaptive parts. |
| [**API Reference**](./docs/api.md) | Verified entry-by-entry signatures for `anya-ui/core`, `anya-ui/react`, `anya-ui/adapters`. |

## Subpath imports

```ts
import { createAnyaRuntime, ViewRecommendationEngine } from 'anya-ui/core';
import { AnyaProvider, useAnyaUI, defineComponent } from 'anya-ui/react';
import { createAgentSessionTransport, createViewArtifact } from 'anya-ui/adapters';
```

The umbrella import (`from 'anya-ui'`) re-exports everything; subpaths exist for tree-shaking and to make the layered architecture explicit.

## Compatibility

- Node `>=18`
- React 18 or 19
- ESM + CJS dual publish
- TypeScript 5.7+

## Contributing & ops

- Workspace setup, lint/test/build commands: see [CONTRIBUTING.md](./CONTRIBUTING.md).
- Security policy: [SECURITY.md](./SECURITY.md).
- Versioning: changesets — `npm run changeset`, then `npm run version-packages`.

## License

MIT — see [LICENSE](./LICENSE).
