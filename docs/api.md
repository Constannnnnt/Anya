# API Reference

Verified against source. Every entry below is exported from the listed subpath. See [Concepts](./concepts.md) for what each means; this doc is for signatures.

## `anya-ui/react`

### `<AnyaProvider>`

Mounts the framework. One of these wraps your tree.

```tsx
interface AnyaProviderProps {
  // Mount-only (changing after mount logs a warning):
  nodes?: AnyaNode[];
  workflows?: WorkflowDefinition[];
  appViews?: AppView[];
  viewTemplates?: ViewTemplate[];
  allowedCapabilities?: NodeCapability[];
  storage?: FileStorage;
  uiMemory?: AnyaRuntimeConfig['uiMemory'];

  // Live (can change between renders):
  onTelemetryEvent?: RuntimeTelemetrySink;
  telemetryIncludePayload?: boolean;
  failureBudgetPolicy?: RuntimeFailureBudgetPolicy;
  onFailureBudgetSignal?: (signal: RuntimeFailureBudgetSignal) => void;
  onRuntimeEvent?: (event: RuntimeEvent, state: RuntimeState) => void | Promise<void>;
  onBehaviorAnalysisRun?: (capture: BehaviorAnalysisRunCapture) => void;

  children: ReactNode;
}
```

### `useAnyaContext()`

Low-level access to all framework services. Most apps should use `useAnyaUI()` instead.

```ts
useAnyaContext(): AnyaContextValue

interface AnyaContextValue {
  catalog: NodeCatalog;
  workflowRegistry: WorkflowRegistry;
  viewRegistry: ViewRegistry;
  sessionMemory: SessionMemory;
  userProfile: UserProfile;
  agentBridge: AgentBridge;
  runtime: RuntimeStore;
  viewEngine: ViewEngine;
  stateGraph: StateGraph;
  viewRecommendations?: ViewRecommendationEngine;
  nodeRenderMap: Map<string, ComponentType<any>>;
  nodeMap: Map<string, AnyaNode>;
  applyThemeUpdate: (update: Record<string, string>) => void;
}
```

### `useAnyaUI()`

The flat facade most apps use. Returns an object with these methods (grouped here by concern, but the actual return is **flat** — no `ui.session.*` namespacing).

#### Sessions

```ts
startAgentSession(input: {
  sessionId?: string;
  userIntent: string;
  messages: AgentMessage[];
  promptOptions?: PromptOptions;
  transport?: AgentSessionTransport;
  currentArtifacts?: SessionArtifact[];
  currentViewId?: string;
}): Promise<AgentSessionRun>

finishAgentSession(
  run: AgentSessionRun,
  options?: FinishAgentSessionOptions,
): Promise<CompletedAgentSession>

runAgentSession(
  input: StartInput & FinishAgentSessionOptions,
): Promise<CompletedAgentSession>

setUserIntent(intent: string, mode?: IntentUpdateMode): void
setAgentStatus(status: AgentState): void
```

#### Views

```ts
viewState: ViewState                              // current spec + bindings
publishView(spec: ViewSpec, input?: PublishViewOptions | 'agent' | 'system'): void

registerAppView(view: AppView): () => void        // returns unregister
registerViewTemplate(template: ViewTemplate): () => void
listAppViews(): AppView[]
listViewTemplates(): ViewTemplate[]
openAppView(viewId: string): AppView | undefined
openViewTemplate(templateId: string, input?): ResolvedView | undefined
saveCurrentViewAsTemplate(input: { id, title, description?, workflow?, tags?, metadata? }): ViewTemplate

setViewContext(patch: Partial<ViewContext>): void
setViewData(nodes: StateNode[]): void
setViewTools(tools: ToolDefinition[]): void
setViewCandidate(input: { spec: ViewSpec | null; bindings?: ActionBinding[] }): void
setWorkflowContext(workflowName?: string): void

planView(input?): ViewPlan
applyViewPlan(plan: ViewPlan): ApplyViewPlanResult
extractActionBindings(spec: ViewSpec): ViewPlan
```

#### Recommendations

```ts
listViewRecommendations(query?: ViewRecommendationQuery): Promise<ViewRecommendation[]>
listCurrentViewRecommendations(query?): Promise<ViewRecommendation[]>

buildViewRecommendationUpdateRequest(
  recommendation: ViewRecommendation,
  options?,
): ViewRecommendationUpdateRequest

runViewRecommendationUpdate(
  recommendation: ViewRecommendation,
  options?: { sessionId?; transport? } & FinishAgentSessionOptions,
): Promise<CompletedAgentSession>
```

#### View change drafts

```ts
createViewChangeDraft(
  recommendation: ViewRecommendation,
  options?: CreateViewChangeDraftFromRecommendationOptions,
): Promise<ViewChangeDraftResult>

reviewViewChangeDraft(draft, input: ReviewViewChangeDraftInput): ReviewedViewChangeDraft
applyViewChangeToApp(draft, options?): AppliedViewChangeToAppResult
applyViewChangeToTemplate(draft, options?): AppliedViewChangeToTemplateResult
getViewChangePreview(draft): ViewChangePreview
```

#### Interactions, tools, runtime

```ts
recordInteraction(interaction: InteractionEvent, hint?: InteractionMeasurementHint): void
executeViewInteraction(interaction: InteractionEvent): Promise<ActionResult[]>
handleUserInteraction(interaction, hint?): Promise<ActionResult[]>  // record + execute
getActionBindings(): ActionBinding[]

registerTool(tool: ToolDefinition, handler?: ToolExecutor): () => void
registerToolHandler(toolId: string, handler: ToolExecutor): () => void
registerActionHandler<T>(type: T, handler: ActionCommandHandler): () => void

dispatchRuntimeEvent(event: RuntimeEvent): RuntimeState
subscribeRuntimeEvents(pattern, listener): () => void
runtimeState: RuntimeState
```

#### Misc

```ts
buildSystemPrompt(opts?: PromptOptions): string
buildSelectionPrompt(userMessage: string): string
getPromptParts(): PromptParts

decode(raw: string): ViewSpec
encodeInteraction(interaction: InteractionEvent): string

setTheme(tokens: Partial<Record<string, string>>): void
getProfile(): string

registerNode(component: AnyaNode): () => void
unregisterNode(name: string): void

context: AnyaContextValue
```

### `defineComponent(input)`

```ts
defineComponent<T extends ZodType>(input: DefineComponentInput<T>): AnyaNode<T>

interface DefineComponentInput<T extends ZodType> {
  name: string;
  description: string;
  propsSchema: T;
  render: ComponentType<AnyaRenderProps>;
  examples?: string[];
  tags?: string[];
  capabilities?: NodeCapability[];
  onRegister?: () => void;
  onUnregister?: () => void;
  onInteraction?: (interaction: InteractionEvent) => void;
}

interface AnyaRenderProps<T = Record<string, unknown>> {
  id: string;
  props: T;
  onInteraction: (
    action: InteractionEvent['action'],
    detail?: {
      trigger?: 'onClick' | 'onDoubleClick' | 'onMouseEnter' | 'onMouseLeave' | 'onChange';
      propName?: string;
      previousValue?: unknown;
      newValue?: unknown;
      semanticDescription?: string;
      sourceId?: string;
      targetIds?: string[];
      targetAction?: string;
      measurementHint?: InteractionMeasurementHint;
    },
  ) => void;
  bindTo?: ViewBindingTarget[];
  children?: React.ReactNode;
}
```

### `<AdaptiveRenderer>`

```ts
interface AdaptiveRendererProps {
  viewSpec: ViewSpec;
  nodeRegistry?: ComponentRegistry;  // defaults to provider's nodeRenderMap
}
```

### Built-in primitives

`Heading`, `Text`, `Badge`, `Card`, `Section`, `Divider`, `Timeline`, `TimelineItem`, `List`, `ListItem` — all `AnyaNode`s. Plus `builtInPrimitives: AnyaNode[]` for one-shot registration.

CSS: `import 'anya-ui/react/index.css'` to get the default styles.

## `anya-ui/core`

### `createAnyaRuntime(config?)`

```ts
createAnyaRuntime(config?: AnyaRuntimeConfig): AnyaRuntime

interface AnyaRuntimeConfig {
  nodes?: NodeDefinition[];
  workflows?: WorkflowDefinition[];
  appViews?: AppView[];
  viewTemplates?: ViewTemplate[];
  allowedCapabilities?: NodeCapability[];
  storage?: FileStorage;
  sessionTransport?: AgentSessionTransport;
  runtime?: { effects?: RuntimeEffect[]; reducer?; onEffectError? };
  uiMemory?: {
    enabled: boolean;
    actorId: string;
    sessionId?: string;
    storePolicy?: 'memory' | 'localstorage' | 'sqlite' | 'indexeddb';
    storeRuntime?: 'browser' | 'node';
    allowMemoryDowngrade?: boolean;
    syncTimeoutMs?: number;
    materializeProfile?: boolean;
    triggerConfig?: TriggerConfig;
    retrievalConfig?: RetrievalConfig;
    windowConfig?: ExtractionWindowConfig;
    sqlite?: SqliteMemoryStoreOptions;
    indexeddb?: IndexedDbMemoryStoreOptions;
    store?: MemoryStore;
    runPrompt?: (prompt: string) => Promise<string>;
    getToolManifest?: () => Promise<string>;
    behavior?: {
      enabled: boolean;
      analyzers?: BehaviorAnalyzer[];
      schedulerPolicy?: BehaviorSchedulerPolicy;
      interpreterPolicy?: FindingInterpreterPolicy;
      aggregateWindowMs?: number;
      syncTimeoutMs?: number;
      windowConfig?: ExtractionWindowConfig;
      captureSnapshots?: boolean;
      onCapture?: (capture: BehaviorAnalysisRunCapture) => void;
      store?: BehaviorStore;
    };
  };
  onPersistError?: (error: unknown) => void;
}
```

`AnyaRuntime` (returned):

```ts
interface AnyaRuntime {
  catalog: NodeCatalog;
  workflowRegistry: WorkflowRegistry;
  viewRegistry: ViewRegistry;
  sessionMemory: SessionMemory;
  userProfile: UserProfile;
  agentBridge: AgentBridge;
  runtime: RuntimeStore;
  viewEngine: ViewEngine;
  stateGraph: StateGraph;
  storage: FileStorage;
  applyView(spec: ViewSpec, input?): ApplySpecResult;
  hydrate(): Promise<{ themeTokens: Record<string, string> }>;
  uiMemoryStore?: MemoryStore;
  uiBehaviorStore?: BehaviorStore;
  uiBehaviorPipeline?: UiBehaviorPipeline;
  viewRecommendations?: ViewRecommendationEngine;
}
```

### Registries

```ts
class NodeCatalog {
  register(definition: NodeDefinition): void
  unregister(name: string): void
  get(name: string): NodeDefinition | undefined
  list(): NodeDefinition[]
  toLLMCatalog(): string                  // YAML for the prompt
  toLLMSummary(): string
}

class SkillRegistry {                     // alias: WorkflowRegistry
  register(definition: SkillDefinition): void
  unregister(name: string): void
  get(name: string): SkillDefinition | undefined
  list(): SkillDefinition[]
  toLLMSkills(): string
  onChange(listener: () => void): () => void
}

class ViewRegistry {
  registerAppView(view: AppView): () => void
  registerTemplate(template: ViewTemplate): () => void
  getAppView(id: string): AppView | undefined
  getTemplate(id: string): ViewTemplate | undefined
  listAppViews(): AppView[]
  listTemplates(): ViewTemplate[]
}
```

### Orchestrator (`DynamicOrchestrator` / `AgentBridge`)

```ts
class DynamicOrchestrator {
  constructor(config: OrchestratorConfig)
  buildSystemPrompt(opts?: PromptOptions, uiMemoryPriors?: string): string
  buildSelectionPrompt(userMessage: string): string
  getPromptParts(format?: 'yaml' | 'json'): PromptParts
  getUiMemoryPriors(): Promise<string | undefined>
  startAgentSession(input): Promise<AgentSessionRun>
  setSessionTransport(transport?: AgentSessionTransport): void
  expandCurrentSkill(additionalYaml: string): ViewSpec | null
}
```

### Session

```ts
interface AgentSessionTransport {
  startSession(input: AgentSessionStartInput): Promise<AgentSessionRun>
}

interface AgentSessionRun {
  sessionId: string;
  controller: AgentSessionController;       // .cancel()
  events: AsyncIterable<AgentSessionEvent>;
}

type AgentSessionEvent =
  | { type: 'session.started'; sessionId; timestamp }
  | { type: 'session.status'; status: AgentSessionStatus; ... }
  | { type: 'artifact.upserted'; artifact: SessionArtifact; ... }
  | { type: 'artifact.removed'; artifactId; ... }
  | { type: 'text.delta'; artifactId; delta; ... }
  | { type: 'session.completed'; ... }
  | { type: 'session.failed'; error: ErrorArtifactPayload; ... };

// Helpers:
collectAgentSessionEvents(run): Promise<AgentSessionEvent[]>
collectArtifactsFromSessionEvents(events): SessionArtifact[]
collectAgentSessionState(events): AgentSessionState
resolvePrimaryViewArtifact(input): ViewArtifact | undefined
isViewArtifact(artifact): boolean
getViewSpec(artifact): ViewSpec | undefined
getViewBindings(artifact): ActionBinding[] | undefined
```

### View planner

```ts
planView(input?: PlanViewInput): ViewPlan
applyViewPlan(plan: ViewPlan): ApplyViewPlanResult
applyLocalViewChanges(input): ApplyLocalChangesResult
buildViewFromState(state): ViewSpec
extractActionBindings(spec: ViewSpec): ViewPlan
createViewEngine(config): ViewEngine
```

### Translator

```ts
decode(raw: string, catalog: NodeCatalog): ViewSpec
encode(interaction: InteractionEvent, context?): string
encodeToolResult(toolId, result): string
findStableSpecCandidate(input): ViewSpec | null
normalizeStyleProp(value: unknown): string | undefined
```

### Recommendations + view changes

```ts
class ViewRecommendationEngine {
  constructor(config: ViewRecommendationEngineConfig)
  list(query?: ViewRecommendationQuery): Promise<ViewRecommendation[]>
  forView(view: ViewMetadata, query?): Promise<ViewRecommendation[]>
  recordApplication(input: {
    recommendation: ViewRecommendation;
    contextArchetype: string;
    appliedSessionId?: string;
    now?: number;
  }): Promise<AppliedRecommendation>
}

buildViewRecommendationUpdateRequest(input): ViewRecommendationUpdateRequest

createViewChangeDraft(input): ViewChangeDraft
reviewViewChangeDraft(draft, input: ReviewViewChangeDraftInput): ReviewedViewChangeDraft
createAppViewFromDraft(reviewed: ReviewedViewChangeDraft, options?): AppView
createTemplateFromDraft(reviewed: ReviewedViewChangeDraft, options?): ViewTemplate
```

### Behaviour pipeline

```ts
class UiBehaviorPipeline {
  constructor(config: UiBehaviorPipelineConfig)
  start(): void
  stop(): void
  flush(mode?: 'sync' | 'async'): Promise<void>
  setOnCapture(callback?: (capture: BehaviorAnalysisRunCapture) => void): void
  getStore(): BehaviorStore
}

// Built-in analyzers (each takes optional { now: () => number })
createBuiltinBehaviorAnalyzers(config?): BehaviorAnalyzer[]
createFittsLawAnalyzer(config?): BehaviorAnalyzer
createSteeringLawAnalyzer(config?): BehaviorAnalyzer
createHickHymanAnalyzer(config?): BehaviorAnalyzer
createKlmLightAnalyzer(config?): BehaviorAnalyzer
createFocusSwitchCostAnalyzer(config?): BehaviorAnalyzer
createInformationScentAnalyzer(config?): BehaviorAnalyzer
createLostnessLightAnalyzer(config?): BehaviorAnalyzer
createFormFrictionAnalyzer(config?): BehaviorAnalyzer
createErrorRecoveryCostAnalyzer(config?): BehaviorAnalyzer
createReworkFrictionAnalyzer(config?): BehaviorAnalyzer
createPracticeCurveAnalyzer(config?): BehaviorAnalyzer

createBehaviorFinding(input): BehaviorAnalyzerFinding

// Composites
buildBehaviorComposites(input: { actorId, findings, now }): BehaviorComposite[]
getCompositeKindForAnalyzer(analyzerId): BehaviorCompositeKind | undefined
resolveFindingContextArchetype(finding): string | undefined

// Severity helpers
severityToScore(severity): number
severityFromScore(score): BehaviorFindingSeverity

// Outcomes
recordAppliedRecommendation(input): Promise<AppliedRecommendation>
reduceRecommendationOutcomes(input): Promise<RecommendationOutcomeReduction>
RECOMMENDATION_OUTCOME_ANALYZER_ID: 'recommendation_outcome'
POST_APPLICATION_SESSIONS: 3
OUTCOME_DELTA: 0.05

// Stores
class InMemoryBehaviorStore implements BehaviorStore { /* ... */ }

// Calibration
evaluateCalibrationProfile(profile, fixtures): CalibrationProfileResult
rankCalibrationProfiles(profiles, fixtures): CalibrationProfileResult[]

// Policy + interpreter
interpretBehaviorFindings(actorId, findings, policy, now?): FindingInterpretationResult
integrateBehaviorFindings(input): Promise<IntegrateBehaviorFindingsResult>
DEFAULT_FINDING_INTERPRETER_POLICY
isFindingKindAllowed(policy, analyzerId, kind): boolean
shouldRetainAsDiagnostic(policy, finding): boolean
shouldPromoteFinding(policy, finding): boolean
shouldRetainForLocalAdaptation(policy, finding): boolean
```

### Memory + retrieval

```ts
class ContextMemoryManager {              // alias: SessionMemory
  setUserIntent(intent: string, mode?): void
  getContext(): MemoryContext
  getInteractions(): InteractionEvent[]
  saveCurrentSpec(spec: ViewSpec): void
  getCurrentSpec(): ViewSpec | null
  toLLMContext(): string
  // ...
}

class AdaptiveProfile {                    // alias: UserProfile
  observe(observation: string): void
  load(): Promise<void>
  save(): Promise<void>
  toLLMProfile(): string
}

class RetrievalComposer {
  constructor(config?: RetrievalConfig)
  retrievePlanningContext(store, actorId, taskContext?, behavior?): Promise<PlanningMemoryContext>
  formatForPrompt(ctx: PlanningMemoryContext): string
}
```

### Storage

```ts
interface FileStorage {
  read(key: string): Promise<string | null>
  write(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

class InMemoryStorage implements FileStorage
class LocalStorageAdapter implements FileStorage

loadThemeTokens(storage): Promise<Record<string, string>>
saveThemeTokens(storage, update): Promise<Record<string, string>>
```

### Runtime store

```ts
createRuntimeStore(config): RuntimeStore
createRuntimeEvent<T>(type, payload, options?): RuntimeEvent<T>
createDefaultRuntimeEffects(input): RuntimeEffect[]
```

### Logging

```ts
getLogger(): Logger
setLogger(logger: Logger): void
setLogLevel(level: LogLevel): void

enum LogLevel { silent, error, warn, info, debug, trace }
const consoleLogger: Logger
const silentLogger: Logger
```

## `anya-ui/adapters`

### Transport

```ts
createAgentSessionTransport(handler: AgentSessionTransportHandler): AgentSessionTransport
createStaticAgentSessionTransport(config: StaticAgentSessionTransportConfig): AgentSessionTransport
createAgentSessionRun(input: CreateAgentSessionRunInput): AgentSessionRun
toAsyncEventStream<T>(stream: SessionEventStream<T>): AsyncIterable<T>

type AgentSessionTransportHandler = (
  input: AgentSessionStartInput,
  context: { signal: AbortSignal },
) => Awaitable<{
  sessionId?: string;
  events: SessionEventStream<AgentSessionEvent>;
  controller?: AgentSessionController | (() => void);
}>;
```

### Artifact factories

Each accepts the typed payload for its kind and returns a `SessionArtifact`. See `src/adapters/artifacts.ts` for full input types.

```ts
createMessageArtifact(input)         // { role, text, format? }
createPlanArtifact(input)            // { objective, steps }
createToolCallArtifact(input)        // { toolId, args, ... }
createToolResultArtifact(input)      // { toolId, ok, result?, error? }
createViewArtifact(input)            // { view: ViewDescriptor }
createSourceBundleArtifact(input)    // { items: SourceRef[] }
createApprovalRequestArtifact(input)
createApprovalResultArtifact(input)
createMemoryPatchArtifact(input)
createErrorArtifact(input)           // { code, message, retryable?, details? }
```

### Event factories

```ts
createSessionStartedEvent({ sessionId, timestamp })
createSessionStatusEvent({ sessionId, timestamp, status })
createSessionCompletedEvent({ sessionId, timestamp })
createSessionFailedEvent({ sessionId, timestamp, error })
createTextDeltaEvent({ sessionId, timestamp, artifactId, delta })
createArtifactUpsertedEvent({ sessionId, timestamp, artifact })
createArtifactRemovedEvent({ sessionId, timestamp, artifactId })
```

## Type aliases worth knowing

- `ContextMemoryManager` ≡ `SessionMemory`
- `AdaptiveProfile` ≡ `UserProfile`
- `DynamicOrchestrator` ≡ `AgentBridge`
- `createOrchestrator` ≡ `createAgentBridge`
- `SkillRegistry` ≡ `WorkflowRegistry`
- `SkillDefinition` ≡ `WorkflowDefinition`
- `ViewArtifact` ≡ `CanonicalViewArtifact`

The aliases reflect a naming alignment that's still in motion (Component → Node, Skill → Workflow). Both names work and will continue to.
