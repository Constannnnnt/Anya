# Architecture Notes (internal)

Reusable scratchpad for documentation. Concise, factual, cited.

## Package shape

Single npm package `anya-ui` with three subpath exports:

- `anya-ui/core` — runtime, registries, memory, view system, recommendations
- `anya-ui/react` — Provider, hooks, primitives, renderer
- `anya-ui/adapters` — transport + artifact + event factories

Source layout: `packages/anya-ui/src/{core,react,adapters}` (`packages/anya-ui/package.json:44-94`).

## The seven services

`createAnyaRuntime(config)` (`src/core/kernel.ts:194`) wires:

1. **`NodeCatalog`** — registered component definitions (name, description, propsSchema, examples)
2. **`SkillRegistry` / `WorkflowRegistry`** — high-level tasks (objective, steps, checklist, guardrails)
3. **`ViewRegistry`** — app views + reusable templates
4. **`SessionMemory` (`ContextMemoryManager`)** — interaction history + current spec
5. **`UserProfile` (`AdaptiveProfile`)** — persistent preferences
6. **`AgentBridge` (`DynamicOrchestrator`)** — prompt builder + session transport bridge
7. **`RuntimeStore`** — event-driven state machine (with effects)

Optional, opt-in:

- **`UiBehaviorPipeline`** — heuristic analyzers + composites + outcome reducer (only if `uiMemory.behavior.enabled`)
- **`ViewRecommendationEngine`** — ranks findings into actionable recommendations
- **`UiMemoryPipeline`** — LLM-driven extraction of preferences/patterns/reflections from interaction events

## Three flows

### A. View generation (user intent → rendered UI)

```
useAnyaUI().runAgentSession({ userIntent, messages, transport })
  ↓
agentBridge.startAgentSession(...)
  ↓ orchestrator.ts:132
buildSystemPrompt(catalog, skills, memory, profile, opts, uiMemoryPriors)
  ↓
transport.startSession({ systemPrompt, userIntent, messages, ... })
  ↓ host calls LLM, emits events
AsyncIterable<AgentSessionEvent>:
  - session.started
  - artifact.upserted (kind='view', payload.view.spec = YAML/JSON ViewSpec)
  - text.delta (streaming message)
  - session.completed
  ↓ collected by finishAgentSession()
runtime.applyView(spec, { source, userIntent, view, bindings })
  ↓
specLifecycle.ts → viewEngine.commit(spec)
  ↓
React Provider's <AdaptiveRenderer> renders ViewSpec → component tree
```

### B. Behavior pipeline (interaction → recommendation)

```
useAnyaUI().recordInteraction(interactionEvent, measurementHint)
  ↓
runtime.dispatch(InteractionEvent)
  ↓ uiEventCollector.collect(event)
MemoryStore.appendEvents([uiMemoryEvent])
  ↓ TriggerManager schedules a run
UiBehaviorPipeline.runAnalysis():
  events → signals (signalProjector)
  signals → segments (segmentReducer)
  segments → session summaries
  summaries → aggregates
  scheduler runs analyzers → BehaviorFinding[]
  interpreter classifies → retained findings → MemoryStore (Reflection/Pattern/Preference)
  buildBehaviorComposites(retained findings) → 4 composites per (kind, context)
  reduceRecommendationOutcomes → outcome findings (improved/regressed/neutral)
  ↓
ViewRecommendationEngine.list({ view, workflow }):
  retained findings → dedupe → score(confidence + recency + support + severity + context + composite + outcomeBias)
  → ViewRecommendation[]
```

### C. Recommendation application (recommendation → applied view + outcome attribution)

```
recommendations = await useAnyaUI().listCurrentViewRecommendations()
  ↓ user picks one
useAnyaUI().runViewRecommendationUpdate(rec, options)
  ↓ inside:
buildViewRecommendationUpdateRequest(rec)
  → { userIntent, message, promptOptions }
  ↓
runAgentSession(request)  // re-uses flow A
  ↓ produces new ViewSpec
runtime.applyView(newSpec, ...)
  ↓ host should call:
viewRecommendationEngine.recordApplication({ recommendation, contextArchetype })
  → captures current composite as baseline
  → upsertAppliedRecommendation({ recommendationId, baselineScore, appliedTs })
  ↓ later, after 3+ post-application sessions:
reduceRecommendationOutcomes (in pipeline):
  → emits outcome finding (improved | regressed | neutral | inconclusive)
  → resolves the AppliedRecommendation
  ↓
Future calls to engine.list() apply outcomeBias:
  improved (+1) > inconclusive (0) > neutral (-0.5) > regressed (-1)
```

## What makes Anya "adaptive"

Three layers, increasing in sophistication:

1. **Memory priors** — `RetrievalComposer.formatForPrompt()` injects preferences/patterns/reflections + composite scores into the system prompt. The LLM gets calibrated, durable signal about who the user is and what hurts.

2. **Composite scores** — 10 HCI heuristics (Fitts, Hick-Hyman, KLM, Steering, FormFriction, ErrorRecoveryCost, ReworkFriction, FocusSwitchCost, InfoScent, LostnessLight) fused into 4 composites per context (motor_friction, cognitive_load, wayfinding_health, input_friction). Surface friction at the *category* level, not per-heuristic.

3. **Outcome loop** — `recordApplication()` captures the baseline composite when a recommendation is applied; after 3 post-application sessions in the same context, the reducer measures whether friction actually decreased. Subsequent rankings of similar recommendations are biased by the historical outcome.

## Persistence

- `MemoryStore` (`src/core/memory/ui/store.ts`) — preferences, patterns, reflections, episodes. Implementations: in-memory (default), localStorage, sqlite, indexeddb. Selection via `uiMemory.storePolicy`.
- `BehaviorStore` (`src/core/memory/ui/behavior/store.ts`) — signals, segments, session summaries, aggregates, findings, composites, applied recommendations. Only `InMemoryBehaviorStore` ships; bring-your-own for persistent.
- `FileStorage` interface (`src/core/storage/`) — theme tokens, profile snapshots. Default: `LocalStorageAdapter` in browsers, `InMemoryStorage` in Node.

## Stability and guarantees

- Mount-only Provider props: `nodes`, `workflows`, `appViews`, `viewTemplates`, `allowedCapabilities`, `storage`, `uiMemory`. Provider warns once if changed after mount.
- Runtime config (`AnyaRuntimeConfig`) is shallow-copied; no live re-config. Remount the Provider to apply new config.
- `useAnyaUI()` returns a flat object (NOT nested subfacades). Method names are descriptive verbs.
- Heuristic analyzers all share dependencies on `signals` + `session_summaries`; the scheduler tracks a dirty set per dependency to avoid redundant runs.

## Stale references

`README.md:12-15` references `docs/current-architecture-and-roadmap.md`, `docs/architecture-redraft.md`, `docs/naming-and-patterns.md`, `docs/package-boundaries.md`. **None of these files exist.** They predate the consolidation commit `d6fcd36 feat(anya-ui): monolithic consolidation and terminology alignment`. The README needs to be rewritten to remove these and reflect the single-package layout.
