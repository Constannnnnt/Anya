# Concepts

Anya UI is built around a small set of named ideas. Once you have these, the API stops feeling sprawling and starts feeling like a layered system.

## ViewSpec — what an agent produces

A `ViewSpec` is the framework's wire format for an entire screen. It's deliberately small:

```ts
interface ViewSpec {
  spec_version?: number;
  layout: 'stack' | 'row' | 'grid' | 'tabs' | 'split';
  nodes: ViewNode[];
  skill?: string;
  ux_rationale?: string;
  theme_update?: Partial<ThemeTokens>;
  profile_observation?: string;
}
```

The agent decides on a `layout`, populates `nodes`, optionally explains the choice in `ux_rationale`, and may attach a `profile_observation` ("user prefers compact lists" — these go into the user's persistent profile).

A `ViewNode` is one component instance:

```ts
interface ViewNode {
  type: string;            // must match a registered Node name
  props: Record<string, unknown>;
  interactions?: UIInteractionDefinition[];
  bindTo?: UIBindTarget[];
  draggable?: boolean;
  children?: ViewNode[];
  id?: string;
}
```

Tree shape is recursive — `children` is just more `ViewNode`s. The validator checks `type` against your `NodeCatalog` and rejects specs that reference unknown components or violate a component's `propsSchema`.

## Node — your component

A Node is the fundamental unit you ship. Define one with `defineComponent`:

```tsx
const Heading = defineComponent({
  name: 'Heading',
  description: 'A semantic page heading.',
  propsSchema: z.object({ text: z.string(), level: z.number().int().min(1).max(6) }),
  render: ({ props }) => React.createElement(`h${props.level}`, null, props.text),
  examples: ['- type: Heading\n  props: { text: Hello, level: 1 }'],
});
```

Three things travel together:

- The `description` and `examples` go to the LLM, so it knows when and how to use the component.
- The `propsSchema` is a runtime contract — invalid specs are rejected before they reach React.
- The `render` is the React component that actually displays it.

This unification is the reason a node "is" both data and code: there is no separate prompt artifact, no JSON schema file, no glue layer. The same `defineComponent` output drives the LLM's catalogue and the React render.

The framework calls your render with `{ id, props, onInteraction, bindTo, children }`. Use `onInteraction(action, detail)` to report events back — the behaviour pipeline picks up these reports and uses them to compute friction scores. Without `onInteraction`, your component is invisible to the adaptive layer.

## Skill (Workflow) — a task contract

A Skill (also exported as `Workflow`) is a higher-level construct: a named task that bundles a *subset* of your components with operating procedure. The agent uses Skills to scope which components are even on the table.

```ts
const triageWorkflow: WorkflowDefinition = {
  name: 'task-triage',
  description: 'Help the user prioritise tasks for today.',
  nodes: ['TaskList', 'PrioritySlider', 'CategoryFilter', 'TimelineView'],
  contextInputs: ['recentTasks', 'userPreferences'],
  outputExpectations: ['A ranked task view with at least one filter'],
  defaultLayout: 'stack',
  sop: {
    objective: 'Surface the 3 most important tasks',
    whenToUse: ['user mentions today', 'user mentions priority'],
    steps: ['rank tasks', 'group by category', 'show timeline if span > 1 day'],
    guardrails: ['never auto-complete a task', 'always show category filter'],
    checklist: [
      { id: 'rank', title: 'Rank by priority', doneWhen: 'top-3 visible', required: true },
    ],
  },
};
```

Skills are optional. If you don't register any, the LLM has access to the full catalogue. If you do, you can scope a session to one — `runAgentSession({ ..., promptOptions: { workflowName: 'task-triage' } })` — and the planner will only emit nodes that workflow allows.

## Memory — what persists between sessions

Three memory categories live in the framework, populated by different mechanisms:

| Kind | What it stores | How it gets there |
|---|---|---|
| **Session memory** | The current view, recent interactions, current intent | `runtime.dispatch` events, automatic |
| **User profile** | Long-lived preferences ("compact density", "prefers tables") | `profile_observation` on a `ViewSpec`, or LLM-extracted |
| **UI memory** | Preferences, patterns, reflections derived from event history | `UiMemoryPipeline.run()` (LLM-driven extraction) and `UiBehaviorPipeline` (heuristic) |

`UiMemoryPipeline` and `UiBehaviorPipeline` are both opt-in — they only run if you pass `uiMemory.enabled: true` (and `uiMemory.behavior.enabled: true` for the heuristic layer) to the Provider.

When the orchestrator builds a system prompt, it asks `RetrievalComposer.formatForPrompt()` for the most relevant priors and injects them. The agent therefore sees both *who this user is* (from profile and preferences) and *where this interface is hurting them* (from composite friction scores). This is the framework's single biggest lever for adaptation.

## Behavior pipeline — measured friction

This is the system that makes "adaptive" something more than memory:

```
interactions → signals → segments → session summaries → aggregates
                                  ↓
                              analyzers (10 HCI heuristics)
                                  ↓
                           findings → composites (4 categories)
                                  ↓
                          ViewRecommendationEngine
```

Ten heuristics ship out of the box: Fitts's Law, Hick-Hyman, KLM, Steering Law, Form Friction, Error Recovery Cost, Rework Friction, Focus Switch Cost, Information Scent, Lostness, plus a Practice Curve trajectory analyzer. Each produces independent findings.

Findings are fused into four composites per task context:

- `motor_friction` — pointer/path effort (Fitts + Steering)
- `cognitive_load` — decision and operator burden (Hick-Hyman + KLM + Focus Switch)
- `wayfinding_health` — navigation quality (Information Scent + Lostness)
- `input_friction` — correction and recovery pressure (Form Friction + Error Recovery + Rework)

Composites are what the prompt sees. They're calibrated, summarised, and stable across heuristic tweaks.

## Recommendation — actionable adaptation

A `ViewRecommendation` is a finding wrapped in actionable language plus a target view:

```ts
interface ViewRecommendation {
  id: string;
  analyzer: string;              // e.g. 'fitts_law'
  priority: number;              // 1..N within the result list
  score: number;
  severity: 'low' | 'medium' | 'high';
  confidence: number;
  support: number;
  summary: string;               // for humans
  recommendation: string;        // imperative, the agent acts on this
  evidence: BehaviorEvidenceMetric[];
  target: { viewId?, viewKind?, templateId?, workflow? };
  scope?: string;
}
```

`ViewRecommendationEngine.list({ view, workflow })` ranks them by confidence × recency × support × severity × context-match × composite-score × outcome-bias. The top N is what you show.

Three ways to act on one:

1. **`runViewRecommendationUpdate(rec, { transport })`** — runs an agent session that revises the current view to address the recommendation. End result: `viewState.spec` is replaced.

2. **`createViewChangeDraft(rec)`** → **`reviewViewChangeDraft(...)`** → **`applyViewChangeToApp(...)` / `applyViewChangeToTemplate(...)`** — the same revision wrapped in a draft/review/apply lifecycle, so the user can preview, accept, or reject before anything persists.

3. **`buildViewRecommendationUpdateRequest(rec)`** — just produces the user intent and message. Useful if you want to compose your own session.

## ViewChangeDraft — preview, review, apply

A draft pairs the current spec with a proposed spec, plus baseline/proposal snapshots and impact metrics. Use this when:

- The recommendation produces a major change and you want the user to opt in.
- You want to **promote a generated view to a persistent app view or template** after acceptance.

The lifecycle is:

```
createViewChangeDraft(recommendation, options)
  → ViewChangeDraftResult { draft, preview, session }
reviewViewChangeDraft(draft, { decision: 'accepted' | 'rejected', notes? })
  → ReviewedViewChangeDraft
applyViewChangeToApp(reviewedDraft, options) | applyViewChangeToTemplate(...)
  → AppliedViewChangeToAppResult (or template equivalent)
```

The audit record on the result tells you who reviewed it, when, and with what notes — useful for compliance or debugging adaptive UI changes.

## Outcome — closing the loop

When you apply a recommendation, calling `recordApplication` snapshots the current composite friction score for that context as the **baseline**. Three sessions later, the pipeline's outcome reducer compares the new composite to the baseline and emits one of four outcome findings:

- `improved` — score dropped by more than 0.05
- `regressed` — score rose by more than 0.05
- `neutral` — within ±0.05
- `inconclusive` — composite missing or no signal

These outcome findings feed back into ranking. Recommendations of the same kind in the same context are biased: improved adaptations are promoted, regressed ones penalised. Over time, the recommendation engine learns *which kinds of changes actually help this user in this context*.

This is what makes Anya UI more than a generative-UI library: it doesn't just propose changes, it measures them and weights its own future proposals by what worked.

## Adapter — connecting an LLM

The `anya-ui/adapters` package exists because Anya is LLM-agnostic. The framework needs an `AgentSessionTransport` to call the model, and adapters provide:

- **Transport helpers** — `createAgentSessionTransport(handler)`, `createStaticAgentSessionTransport(config)`, `toAsyncEventStream(...)`, `createAgentSessionRun(...)`.
- **Artifact factories** — typed builders for each `SessionArtifact` kind.
- **Event factories** — typed builders for each `AgentSessionEvent` type.

You write the *handler* — the function that calls Anthropic, OpenAI, a self-hosted endpoint, or whatever you use — and `createAgentSessionTransport` wraps it in the right interface. See [Getting Started §3](./getting-started.md#3-build-a-transport).

## How it fits together

A clean mental model:

- **Nodes** are the legos.
- **Skills** scope which legos a task uses.
- **Agent** assembles legos into a `ViewSpec`.
- **Renderer** turns `ViewSpec` into React.
- **Behavior pipeline** watches the user use it and computes friction.
- **Recommendation engine** turns friction into a proposal.
- **Outcome loop** measures whether proposals helped.
- **Memory** carries forward what was learned.

Each layer is independently optional. You can use just the generative-view layer without behaviour. You can run the behaviour pipeline against a non-generative app to surface friction without using Anya for rendering. You can plug your own analyzer into the heuristic layer. The defaults are designed so the simple case is one Provider and one transport — but every seam is exposed.
