# Public API Surface (verified)

Only what's actually exported and verified by reading the source. No hallucinations.

## `anya-ui/core`

### Runtime

```ts
createAnyaRuntime(config?: AnyaRuntimeConfig): AnyaRuntime
```

`AnyaRuntimeConfig` (selected fields, `src/core/kernel.ts:71-126`):

| Field | Purpose |
|---|---|
| `nodes?: NodeDefinition[]` | Component definitions to register at boot |
| `workflows?: WorkflowDefinition[]` | High-level skills |
| `appViews?: AppView[]` | Pre-authored persistent views |
| `viewTemplates?: ViewTemplate[]` | Reusable view templates |
| `allowedCapabilities?: NodeCapability[]` | Component capability allowlist |
| `storage?: FileStorage` | Persistence backend (default: localStorage in browser) |
| `sessionTransport?: AgentSessionTransport` | LLM session adapter |
| `uiMemory?: { ... }` | Opt-in UI memory pipeline |
| `runtime?: { effects?, reducer?, onEffectError? }` | Custom event handling |

`uiMemory` sub-fields:

- `enabled: boolean`
- `actorId: string`
- `sessionId?: string`
- `storePolicy?: 'memory' | 'sqlite' | 'indexeddb' | 'localstorage'`
- `runPrompt?` — async LLM call for memory extraction
- `behavior?: { enabled, analyzers?, schedulerPolicy?, interpreterPolicy?, captureSnapshots?, onCapture?, store? }`
- `retrievalConfig?` — ranking weights for behavior priors
- `triggerConfig?`, `windowConfig?` — pipeline scheduling

`AnyaRuntime` returned services:
`catalog`, `workflowRegistry`, `viewRegistry`, `sessionMemory`, `userProfile`, `agentBridge`, `runtime`, `viewEngine`, `stateGraph`, `storage`, `applyView()`, `hydrate()`, `uiMemoryStore?`, `uiBehaviorStore?`, `uiBehaviorPipeline?`, `viewRecommendations?`.

### Orchestrator (DynamicOrchestrator / AgentBridge)

```ts
class DynamicOrchestrator {
  buildSystemPrompt(opts?: PromptOptions, uiMemoryPriors?: string): string
  buildSelectionPrompt(userMessage: string): string
  getPromptParts(format?: 'yaml' | 'json'): PromptParts
  getUiMemoryPriors(): Promise<string | undefined>
  startAgentSession(input): Promise<AgentSessionRun>
  setSessionTransport(transport?: AgentSessionTransport): void
  expandCurrentSkill(additionalYaml: string): ViewSpec | null
}
```

### Translator

```ts
decode(rawYamlOrJson: string, catalog: NodeCatalog): ViewSpec
encode(interaction: InteractionEvent, context?): string
encodeToolResult(...): string
```

### View planner

```ts
planView(input?): ViewPlan
applyViewPlan(plan: ViewPlan): ApplyViewPlanResult
applyLocalViewChanges(...)
buildViewFromState(...)
extractActionBindings(spec: ViewSpec): ViewPlan
```

### Recommendations + view changes

```ts
class ViewRecommendationEngine {
  list(query?: ViewRecommendationQuery): Promise<ViewRecommendation[]>
  forView(view: ViewMetadata, query?): Promise<ViewRecommendation[]>
  recordApplication(input: { recommendation, contextArchetype, appliedSessionId?, now? }): Promise<AppliedRecommendation>
}

buildViewRecommendationUpdateRequest(input): ViewRecommendationUpdateRequest
createViewChangeDraft(input): ViewChangeDraft
reviewViewChangeDraft(draft, input): ReviewedViewChangeDraft
createAppViewFromDraft(reviewed): AppView
createTemplateFromDraft(reviewed): ViewTemplate
```

### Session

```ts
interface AgentSessionTransport {
  startSession(input: AgentSessionStartInput): Promise<AgentSessionRun>
}

interface AgentSessionRun {
  sessionId: string
  controller: AgentSessionController  // .cancel()
  events: AsyncIterable<AgentSessionEvent>
}

type AgentSessionEvent =
  | { type: 'session.started'; sessionId, timestamp }
  | { type: 'session.status'; status, ... }
  | { type: 'artifact.upserted'; artifact: SessionArtifact }
  | { type: 'artifact.removed'; artifactId, ... }
  | { type: 'text.delta'; artifactId, delta, ... }
  | { type: 'session.completed'; ... }
  | { type: 'session.failed'; error, ... }
```

### Behavior pipeline (advanced)

```ts
class UiBehaviorPipeline {
  start(): void
  stop(): void
  flush(mode: 'sync' | 'async'): Promise<void>
  setOnCapture(callback): void
  getStore(): BehaviorStore
}

// Built-in analyzers
createBuiltinBehaviorAnalyzers(config?): BehaviorAnalyzer[]
createFittsLawAnalyzer(config?): BehaviorAnalyzer
// ... 10 more

// Composites + outcomes
buildBehaviorComposites(input): BehaviorComposite[]
recordAppliedRecommendation(input): Promise<AppliedRecommendation>
reduceRecommendationOutcomes(input): Promise<RecommendationOutcomeReduction>
```

### Storage

```ts
interface FileStorage {
  read(key): Promise<string | null>
  write(key, value): Promise<void>
  delete(key): Promise<void>
}

class InMemoryStorage implements FileStorage
class LocalStorageAdapter implements FileStorage
```

### Calibration (advanced)

```ts
evaluateCalibrationProfile(profile, fixtures): CalibrationProfileResult
rankCalibrationProfiles(profiles, fixtures): CalibrationProfileResult[]
```

## `anya-ui/react`

### Components

```tsx
<AnyaProvider
  nodes={[...]}                    // Mount-only
  workflows={[...]}                 // Mount-only
  appViews={[...]}                  // Mount-only
  viewTemplates={[...]}             // Mount-only
  allowedCapabilities={[...]}       // Mount-only
  storage={...}                     // Mount-only
  uiMemory={{ enabled, actorId, ... }}  // Mount-only
  onTelemetryEvent={...}            // Live
  telemetryIncludePayload={false}   // Live
  failureBudgetPolicy={...}         // Live
  onFailureBudgetSignal={...}       // Live
  onRuntimeEvent={...}              // Live
  onBehaviorAnalysisRun={...}       // Live (NOT onBehaviorCapture — that's wrong)
>
  {children}
</AnyaProvider>

<AdaptiveRenderer
  viewSpec={spec}
  nodeRegistry={...}                // Optional override; defaults to provider's nodeRenderMap
/>
```

### Component definition

```tsx
const Slider = defineComponent({
  name: 'ColorSlider',
  description: 'Numeric range input',
  propsSchema: z.object({ label: z.string(), min: z.number(), max: z.number() }),
  render: ({ id, props, onInteraction }) => (
    <input
      type="range"
      min={props.min}
      max={props.max}
      onChange={(e) => onInteraction('change', {
        propName: 'value',
        newValue: Number(e.target.value),
      })}
    />
  ),
  examples: ['- type: ColorSlider\n  props:\n    label: Red\n    min: 0\n    max: 255'],
  capabilities: [],
});
```

### Hook

`useAnyaUI()` returns a **flat** object (NOT nested). Key methods:

**Sessions / agent**

- `startAgentSession(input): Promise<AgentSessionRun>`
- `finishAgentSession(run, options?): Promise<CompletedAgentSession>`
- `runAgentSession(input): Promise<CompletedAgentSession>` ← convenience: start + collect + finish
- `setUserIntent(intent, mode?)`
- `setAgentStatus(status)`

**Views**

- `publishView(spec, input?)` — apply a manually-constructed ViewSpec
- `viewState: ViewState` — current view + bindings
- `registerAppView(view)` / `registerViewTemplate(template)` — runtime registration
- `openAppView(viewId)` / `openViewTemplate(templateId, input?)`
- `saveCurrentViewAsTemplate({ id, title, ... })`
- `setViewContext(patch)` / `setViewData(nodes)` / `setViewTools(tools)`
- `planView(input?)` / `applyViewPlan(plan)` / `extractActionBindings(spec)`

**Recommendations**

- `listViewRecommendations(query?): Promise<ViewRecommendation[]>`
- `listCurrentViewRecommendations(query?): Promise<ViewRecommendation[]>` ← scoped to current view
- `buildViewRecommendationUpdateRequest(rec, options?)`
- `runViewRecommendationUpdate(rec, options?): Promise<CompletedAgentSession>` ← end-to-end apply

**Drafts**

- `createViewChangeDraft(rec, options?): Promise<ViewChangeDraftResult>`
- `reviewViewChangeDraft(draft, input)`
- `applyViewChangeToApp(draft, options?)` / `applyViewChangeToTemplate(...)`
- `getViewChangePreview(draft)`

**Interaction**

- `recordInteraction(interaction, measurementHint?)`
- `executeViewInteraction(interaction)`
- `handleUserInteraction(interaction, measurementHint?)` ← record + execute

**Tools**

- `registerTool(tool, handler?)` / `registerToolHandler(toolId, handler)`
- `registerActionHandler(type, handler)`

**Misc**

- `decode(raw): ViewSpec` / `encodeInteraction(interaction): string`
- `buildSystemPrompt(opts?)` / `buildSelectionPrompt(userMessage)` / `getPromptParts()`
- `setTheme(tokens)` / `dispatchRuntimeEvent(event)` / `subscribeRuntimeEvents(pattern, listener)`
- `registerNode(component)` / `unregisterNode(name)`
- `runtimeState: RuntimeState`
- `context: AnyaContextValue`

### Built-in primitives

`Heading, Text, Badge, Card, Section, Divider, Timeline, TimelineItem, List, ListItem, builtInPrimitives` — drop-in components plus a `builtInPrimitives` array suitable for `<AnyaProvider nodes={builtInPrimitives}>`.

## `anya-ui/adapters`

### Transport

```ts
createAgentSessionTransport(handler): AgentSessionTransport
createStaticAgentSessionTransport(config): AgentSessionTransport
createAgentSessionRun(input): AgentSessionRun
toAsyncEventStream(stream): AsyncIterable
```

### Artifact factories

`createMessageArtifact`, `createPlanArtifact`, `createToolCallArtifact`, `createToolResultArtifact`, `createViewArtifact`, `createSourceBundleArtifact`, `createApprovalRequestArtifact`, `createApprovalResultArtifact`, `createMemoryPatchArtifact`, `createErrorArtifact`.

### Event factories

`createSessionStartedEvent`, `createSessionStatusEvent`, `createSessionCompletedEvent`, `createSessionFailedEvent`, `createTextDeltaEvent`, `createArtifactUpsertedEvent`, `createArtifactRemovedEvent`.

## Aliases worth knowing

- `ContextMemoryManager` ≡ `SessionMemory`
- `AdaptiveProfile` ≡ `UserProfile`
- `DynamicOrchestrator` ≡ `AgentBridge`
- `createOrchestrator` ≡ `createAgentBridge`
- `SkillRegistry` ≡ `WorkflowRegistry`, `SkillDefinition` ≡ `WorkflowDefinition`
