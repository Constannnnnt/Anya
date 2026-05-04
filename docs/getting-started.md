# Getting Started

This guide takes you from an empty React project to a working Anya app with one generated view. Plan on 15 minutes. By the end you will have:

- An `<AnyaProvider>` mounted with two registered components.
- A `transport` that calls your LLM and streams a `ViewSpec` back.
- A button that generates a UI and renders it through `<AdaptiveRenderer>`.

The sample below is intentionally minimal. The [Concepts](./concepts.md) doc explains *why* each piece exists; this guide is just *how to wire it up*.

## 1. Install

```bash
npm install anya-ui zod react react-dom
```

Anya UI is a single package with three subpath exports:

| Subpath | Use it for |
|---|---|
| `anya-ui/core` | Runtime, registries, view planner, behaviour pipeline (framework-agnostic) |
| `anya-ui/react` | `AnyaProvider`, `useAnyaUI`, `defineComponent`, `AdaptiveRenderer`, primitives |
| `anya-ui/adapters` | Transport + artifact + event factories for LLM integration |

The umbrella import `from 'anya-ui'` re-exports all three; subpaths exist for tree-shaking and clarity.

## 2. Define components

Each component is a normal React component plus a Zod schema and a description. The schema constrains what props the LLM is allowed to send; the description is included in the system prompt so the LLM knows when to use it.

```tsx
// components.ts
import { defineComponent } from 'anya-ui/react';
import { z } from 'zod';
import React from 'react';

export const Heading = defineComponent({
  name: 'Heading',
  description: 'A semantic page heading. Use for titles and section headers.',
  propsSchema: z.object({
    text: z.string(),
    level: z.number().int().min(1).max(6),
  }),
  render: ({ props }) => React.createElement(`h${props.level}`, null, props.text),
});

export const Card = defineComponent({
  name: 'Card',
  description: 'A bordered container. Children render inside.',
  propsSchema: z.object({
    title: z.string().optional(),
  }),
  render: ({ props, children }) => (
    <section style={{ border: '1px solid #ddd', padding: 16, borderRadius: 8 }}>
      {props.title && <h3>{props.title}</h3>}
      {children}
    </section>
  ),
  examples: [
    `- type: Card
  props:
    title: Welcome
  children:
    - type: Heading
      props:
        text: Hello
        level: 2`,
  ],
});
```

The `examples` field is optional but strongly recommended — they're injected into the LLM's system prompt and dramatically improve the quality of generated specs.

## 3. Build a transport

A transport is the only piece you have to write yourself. It receives a system prompt + messages, calls your LLM, and emits session events.

The interface is one method:

```ts
interface AgentSessionTransport {
  startSession(input: AgentSessionStartInput): Promise<AgentSessionRun>;
}
```

Use the helper from `anya-ui/adapters` so you don't have to implement it by hand:

```ts
// transport.ts
import { createAgentSessionTransport, createSessionStartedEvent,
         createArtifactUpsertedEvent, createViewArtifact,
         createSessionCompletedEvent } from 'anya-ui/adapters';

export const transport = createAgentSessionTransport(async (input, ctx) => {
  // 1. Call your LLM. The system prompt is already built for you;
  //    you just pass it through with the user messages.
  const response = await callYourLLM({
    system: input.systemPrompt,
    messages: input.messages,
    signal: ctx.signal,
  });

  // 2. Parse the model's response into a ViewSpec. If your model
  //    returns YAML inside the message, useAnyaUI().decode() does the
  //    parsing + validation. For this minimal example assume the
  //    response object already has a parsed spec.
  const sessionId = `s_${Date.now()}`;
  const events = (async function* () {
    yield createSessionStartedEvent({ sessionId, timestamp: Date.now() });

    yield createArtifactUpsertedEvent({
      sessionId,
      timestamp: Date.now(),
      artifact: createViewArtifact({
        id: `view-${sessionId}`,
        sessionId,
        createdAt: Date.now(),
        audience: 'user',
        payload: {
          view: {
            id: 'generated-1',
            format: 'ui_spec',
            kind: 'generated',
            spec: response.spec,
          },
        },
      }),
    });

    yield createSessionCompletedEvent({ sessionId, timestamp: Date.now() });
  })();

  return { sessionId, events };
});
```

**Important:** always emit `session.started` first and `session.completed` (or `session.failed`) last. In between, emit one or more `artifact.upserted` events. For a generative view, the key artifact has `kind: 'view'` and a payload containing the parsed `ViewSpec`.

If you're prototyping without a real LLM, use `createStaticAgentSessionTransport({ events: [...] })` to feed a hardcoded sequence.

## 4. Mount the Provider

```tsx
// App.tsx
import { AnyaProvider } from 'anya-ui/react';
import { Heading, Card } from './components';

export default function Root() {
  return (
    <AnyaProvider nodes={[Heading, Card]}>
      <App />
    </AnyaProvider>
  );
}
```

The `nodes` prop is **mount-only** — to add or replace nodes after mount, use `useAnyaUI().registerNode(...)` or remount the Provider. The same applies to `workflows`, `appViews`, `viewTemplates`, `allowedCapabilities`, `storage`, and `uiMemory`. The Provider warns once if any of these change after the initial render.

## 5. Generate and render a view

```tsx
// App.tsx (continued)
import { useAnyaUI, AdaptiveRenderer } from 'anya-ui/react';
import { transport } from './transport';

function App() {
  const ui = useAnyaUI();

  const generate = () =>
    ui.runAgentSession({
      userIntent: 'Greet the user and show today\'s tip',
      messages: [],
      transport,
    });

  return (
    <main>
      <button onClick={generate}>Generate UI</button>
      {ui.viewState.spec && <AdaptiveRenderer viewSpec={ui.viewState.spec} />}
    </main>
  );
}
```

`runAgentSession()` is the convenience that bundles `startAgentSession + collect events + finishAgentSession`. It returns a `CompletedAgentSession` containing the primary view spec, all artifacts, and the raw event log. The framework also writes the spec into `viewState.spec` for you, so `<AdaptiveRenderer>` can pick it up directly.

That's it for a minimal generative app. Run it, click Generate, and the LLM will return a `ViewSpec` that gets rendered through your registered components.

## 6. Turn on the adaptive layer

The behaviour pipeline is opt-in. Enable it by passing `uiMemory` to the Provider:

```tsx
<AnyaProvider
  nodes={[Heading, Card]}
  uiMemory={{
    enabled: true,
    actorId: currentUser.id,
    behavior: { enabled: true },
  }}
>
  {children}
</AnyaProvider>
```

With this enabled:

- Every interaction is recorded by `useAnyaUI().recordInteraction(...)` (or automatically when components call `onInteraction` from `defineComponent`).
- Ten HCI analyzers run periodically against the event stream, producing findings.
- Findings are fused into four composite friction scores per context (`motor_friction`, `cognitive_load`, `wayfinding_health`, `input_friction`).
- A `ViewRecommendationEngine` is exposed at `useAnyaUI().listCurrentViewRecommendations()`.

A panel that lists and applies recommendations:

```tsx
function RecommendationsPanel() {
  const ui = useAnyaUI();
  const [recs, setRecs] = useState([]);

  useEffect(() => {
    ui.listCurrentViewRecommendations().then(setRecs);
  }, [ui.viewState.spec?.id]);

  return (
    <aside>
      {recs.map((r) => (
        <button
          key={r.id}
          onClick={() => ui.runViewRecommendationUpdate(r, { transport })}
        >
          [{r.severity}] {r.summary}
        </button>
      ))}
    </aside>
  );
}
```

`runViewRecommendationUpdate` runs an agent session whose user intent is "revise the current view to address this recommendation". The new view replaces the current one. To attribute an outcome, see the [Adaptive Behavior guide](./adaptive-behavior.md#closing-the-loop).

## Where to go next

- [**Concepts**](./concepts.md) — what `ViewSpec`, `Node`, `Skill`, and `Workflow` actually are.
- [**Adaptive Behavior**](./adaptive-behavior.md) — the HCI layer in depth: heuristics, composites, outcomes, calibration.
- [**API Reference**](./api.md) — every public export with its signature.

## Common gotchas

- **Provider warns about mount-only props.** If you pass `nodes={someArray}` and that array reference changes between renders, the Provider warns once. Pass a stable reference or move runtime registration to `useAnyaUI().registerNode(...)`.
- **The transport doesn't see your component catalogue.** It only sees `input.systemPrompt`, `input.userIntent`, and `input.messages`. The framework has already injected the catalogue into the system prompt by the time your transport is called — don't rebuild it yourself.
- **`viewState.spec` is `null` until you generate or publish.** A blank app has no view. Either run a session or call `useAnyaUI().publishView(myStaticSpec)` to set one explicitly.
- **`recordApplication` is the missing step in the outcome loop.** `runViewRecommendationUpdate` does not automatically record the application — you must call `useAnyaUI().context.viewRecommendations?.recordApplication(...)` afterwards if you want outcome attribution. The Adaptive Behavior guide covers this.
