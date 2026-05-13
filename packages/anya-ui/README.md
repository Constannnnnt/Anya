# anya-ui

A rendering layer for agentic interfaces. Agents produce markdown with embedded affordances; the framework renders them to interactive DOM and reports user actions back.

## Where this fits

```
Agent → Spec → anya-ui → User → Agent
```

The agent writes a markdown document. The framework renders it. The user acts. The framework encodes what happened. The agent receives it on the next turn.

anya-ui doesn't know about your agent, your tools, or your backend. It knows one thing: **how to turn a spec into interactive DOM and tell you what the user did.**

## The spec format

Standard markdown for content. Fenced YAML blocks for interactive affordances.

````markdown
# Your Tasks

3 items need attention today.

```action
name: mark_done
label: Mark PR #42 done
params:
  id: 42
```

```input
name: add_task
submit: Add
fields:
  - name: title
    type: text
    placeholder: What needs doing?
  - name: priority
    type: select
    options: [high, medium, low]
```

```group
layout: row
```

**Revenue**: $42k

**Users**: 1,204

```end
```
````

Four primitives:
- **Content** — markdown (headings, lists, tables, links, emphasis)
- **Action** — a named button the user can click
- **Input** — a named form the user can fill and submit
- **Group** — a layout container (`row`, `grid`, `stack`)

## Install

```bash
npm install anya-ui
```

## Usage

```typescript
import { mount } from 'anya-ui';

const ui = mount(specString, document.getElementById('app'));

ui.on('action', (feedback) => {
  // { action: "mark_done", params: { id: 42 }, timestamp: ... }
  sendToAgent(feedback);
});

// Agent responds with new spec
ui.update(newSpecString);
```

## Three entry points

| Import | Purpose | DOM required? |
|--------|---------|---------------|
| `anya-ui` | Full renderer + protocol | Yes |
| `anya-ui/protocol` | Parse, encode, prompt builder | No |
| `anya-ui/measure` | Signal collection + friction scoring | Yes |

Use `anya-ui/protocol` when you only need to parse specs or encode feedback — no DOM dependency. Useful for server-side tooling, React Native bridges, or custom renderers.

```typescript
import { parse, encode, buildSystemPrompt } from 'anya-ui/protocol';
```

## Teaching the agent

```typescript
import { buildSystemPrompt, encodeHistory } from 'anya-ui';

const systemPrompt = buildSystemPrompt({
  actions: [
    { name: 'mark_done', description: 'Mark a task as completed' },
    { name: 'assign', description: 'Assign a task to someone' },
  ],
  history: encodeHistory(userActions),
});

// Pass systemPrompt to your LLM alongside the user's message
```

The agent learns the format from the system prompt and produces valid specs naturally — fenced code blocks are in every model's training data.

## Encoding feedback

When the user acts, encode it for the agent's next turn:

```typescript
import { encode } from 'anya-ui';

ui.on('action', (feedback) => {
  const text = encode(feedback);
  // "User clicked "mark_done" (id=42)"
  // "User submitted "add_task" with title="Write tests", priority="high""
  appendToConversation(text);
});
```

## Framework integration

anya-ui is vanilla DOM. Wrap it in your framework's lifecycle:

### React

```tsx
import { useRef, useEffect } from 'react';
import { mount, type AnyaInstance } from 'anya-ui';

function AnyaView({ spec, onAction }) {
  const ref = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<AnyaInstance | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    instanceRef.current = mount(spec, ref.current);
    instanceRef.current.on('action', onAction);
    return () => instanceRef.current?.destroy();
  }, []);

  useEffect(() => {
    instanceRef.current?.update(spec);
  }, [spec]);

  return <div ref={ref} />;
}
```

### React (protocol-only)

If you want to render with your own React components instead of anya-ui's DOM:

```tsx
import { parse, encode, isAction, isInput, isGroup, isContent } from 'anya-ui/protocol';
import type { Spec, SpecNode } from 'anya-ui/protocol';

function AnyaView({ specString, onAction }) {
  const spec = useMemo(() => parse(specString), [specString]);

  return (
    <div>
      {spec.nodes.map((node, i) => (
        <SpecNodeView key={i} node={node} onAction={onAction} />
      ))}
    </div>
  );
}

function SpecNodeView({ node, onAction }) {
  if (isContent(node)) return <Markdown>{node.markdown}</Markdown>;
  if (isAction(node)) return <Button onClick={() => onAction(node.action, node.params)}>{node.label}</Button>;
  if (isInput(node)) return <FormFromFields fields={node.fields} onSubmit={v => onAction(node.input, v)} />;
  if (isGroup(node)) return <Flex>{node.content.map((n, i) => <SpecNodeView key={i} node={n} onAction={onAction} />)}</Flex>;
  return null;
}
```

### Web Component

```html
<script type="module">
  import { mount } from 'anya-ui';

  class AnyaElement extends HTMLElement {
    connectedCallback() {
      this.instance = mount(this.getAttribute('spec'), this);
      this.instance.on('action', (f) => this.dispatchEvent(new CustomEvent('action', { detail: f })));
    }
    static get observedAttributes() { return ['spec']; }
    attributeChangedCallback(_, __, val) { this.instance?.update(val); }
    disconnectedCallback() { this.instance?.destroy(); }
  }
  customElements.define('anya-ui', AnyaElement);
</script>
```

## Measurement (optional)

Collect interaction signals and compute friction scores:

```typescript
import { mount } from 'anya-ui';
import { withMeasurement } from 'anya-ui/measure';

const ui = mount(spec, container);
const measured = withMeasurement(ui, container.querySelector('.anya'));

// Raw signals: timestamped action events with timing + choice metadata
const signals = measured.signals();
// [{ ts, action, kind: 'click'|'submit', durationMs, choiceCount }]

// Computed scores: Hick-Hyman cognitive load from current DOM state
const scores = measured.scores();
// [{ kind: 'cognitive', score: 0.3, severity: 'low', detail: '3 interactive elements...' }]
```

The measurement module emits **raw signals** — what happened, when, how many choices were visible. It does NOT interpret signals, detect patterns, or advise the agent. That's the orchestration layer's job.

## Styling

Import the default stylesheet or use CSS variables to theme:

```css
@import 'anya-ui/src/anya.css';

:root {
  --anya-text: #1a1a1a;
  --anya-border: #d1d5db;
  --anya-btn-bg: #fff;
  --anya-btn-hover: #f3f4f6;
  --anya-focus: #3b82f6;
}
```

Or write your own styles targeting `.anya-action`, `.anya-input`, `.anya-field`, `.anya-group`, `.anya-layout-row`, etc.

## API

### `mount(spec: string | Spec, target: HTMLElement): AnyaInstance`

Render a spec into a container element.

### `AnyaInstance`

- `.update(spec)` — re-render with new spec
- `.on('action', handler)` — listen for user actions, returns unsubscribe fn
- `.destroy()` — remove DOM, cleanup listeners
- `.getSpec()` — current parsed spec (or null after destroy)

### `parse(raw: string): Spec`

Parse a markdown+YAML string into a structured Spec object.

### `render(spec: Spec, opts: RenderOptions): HTMLElement`

Render a Spec to a detached DOM element (for custom mounting).

### `encode(feedback: ActionFeedback): string`

Format a user action as a human-readable string for agent context.

### `encodeHistory(history: ActionFeedback[]): string`

Format multiple actions as newline-separated entries.

### `buildSystemPrompt(opts?: PromptOptions): string`

Generate a system prompt that teaches an agent the spec format.

Options:
- `actions` — list of available actions with descriptions
- `inputs` — list of available inputs with descriptions
- `context` — arbitrary context string appended to the prompt
- `history` — recent user action history (from `encodeHistory`)

### `withMeasurement(instance, root): MeasuredInstance`

Attach signal collection (from `anya-ui/measure`).

- `.signals()` — collected interaction signals
- `.scores()` — computed friction scores from current DOM
- `.destroy()` — cleanup and destroy instance

## Design principles

1. **Protocol, not component library** — the spec is the interface contract between agent and renderer
2. **Agent-native format** — markdown + YAML fenced blocks, formats agents produce at near-100% reliability
3. **Graceful degradation** — spec renders as readable code blocks in any markdown viewer
4. **Framework-agnostic** — vanilla DOM output, wrap in any framework; or use protocol-only and render yourself
5. **Feedback is first-class** — every affordance has a name; every user action is encodable
6. **Observation without opinion** — measurement emits signals, doesn't interpret them
