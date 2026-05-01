/**
 * Runtime composition root.
 * Wires catalog, workflow registry, session memory, runtime, and view engine
 * so hosts can bootstrap Anya with one call.
 */
import {
  NodeCatalog,
  type NodeCapability,
  type NodeDefinition,
} from './registry/catalog';
import { SkillRegistry, type SkillDefinition } from './registry/skills';
import { ContextMemoryManager } from './memory/context';
import { AdaptiveProfile } from './memory/profile';
import { DynamicOrchestrator } from './orchestrator';
import { LocalStorageAdapter } from './storage/localStorage';
import { InMemoryStorage } from './storage/memory';
import type { FileStorage } from './storage/interface';
import type { AgentSessionTransport } from './session';
import {
  createRuntimeEvent,
  createRuntimeStore,
  type RuntimeEffect,
  type RuntimeEffectErrorHandler,
  type RuntimeReducer,
  type RuntimeStore,
} from './runtime';
import {
  ViewRegistry,
  type AppView,
  type ViewTemplate,
} from './views/registry';
import type { ActionBinding } from './views';
import type { ViewMetadata } from './types';
import { createViewEngine, type ViewEngine } from './views/engine';
import { extractActionBindings } from './views/planner';
import { loadThemeTokens } from './theme';
import type { RuntimeEventSource } from './runtime/events';
import type { StateGraph } from './state';
import type { ViewSpec } from './types';
import { getLogger } from './logging';
import type { MemoryStore } from './memory/ui/store';
import { RetrievalComposer } from './memory/ui/retrieval';
import { InMemoryMemoryStore } from './memory/ui/inMemoryAdapter';
import { UiEventCollector } from './memory/ui/eventCollector';
import { TriggerManager } from './memory/ui/triggerManager';
import { UiMemoryPipeline } from './memory/ui/pipeline';
import {
  DEFAULT_FINDING_INTERPRETER_POLICY,
  InMemoryBehaviorStore,
  UiBehaviorPipeline,
  type BehaviorAnalysisRunCapture,
  type BehaviorAnalyzer,
  type BehaviorStore,
  type FindingInterpreterPolicy,
  type UiBehaviorPipelineConfig,
  type BehaviorSchedulerPolicy,
} from './memory/ui/behavior';
import {
  createMemoryStoreByPolicySync,
  type MemoryStorePolicy,
  type MemoryStoreRuntime,
} from './memory/ui/storeFactory';
import type { IndexedDbMemoryStoreOptions } from './memory/ui/indexedDbAdapter';
import type { SQLiteMemoryStoreOptions } from './memory/ui/sqliteAdapter';
import { applyDecodedSpec, type ApplySpecResult } from './specLifecycle';
import {
  ViewRecommendationEngine,
  type ViewRecommendationEngineConfig,
} from './viewRecommendations';

export interface AnyaRuntimeConfig {
  nodes?: NodeDefinition[];
  workflows?: SkillDefinition[];
  appViews?: AppView[];
  viewTemplates?: ViewTemplate[];
  allowedCapabilities?: NodeCapability[];
  storage?: FileStorage;
  sessionTransport?: AgentSessionTransport;
  maxInteractions?: number;
  maxReasoningTraces?: number;
  onPersistError?: (error: unknown) => void;
  runtime?: {
    effects?: RuntimeEffect[];
    reducer?: RuntimeReducer;
    onEffectError?: RuntimeEffectErrorHandler;
    maxDispatchDepth?: number;
    dedupeNestedEventIds?: boolean;
  };
  views?: {
    allowedToolIds?: string[];
    maxExecutionHistory?: number;
  };
  /** Opt-in UI memory pipeline configuration. */
  uiMemory?: {
    enabled: boolean;
    actorId: string;
    sessionId?: string;
    store?: MemoryStore;
    storePolicy?: MemoryStorePolicy;
    storeRuntime?: MemoryStoreRuntime;
    sqlite?: SQLiteMemoryStoreOptions;
    indexeddb?: IndexedDbMemoryStoreOptions;
    /** Explicit opt-in for downgrading a requested persistent store to memory. */
    allowMemoryDowngrade?: boolean;
    triggerConfig?: import('./memory/ui/triggerManager').TriggerConfig;
    retrievalConfig?: import('./memory/ui/retrieval').RetrievalConfig;
    runPrompt?: import('./memory/ui/extractionWorker').PromptRunner;
    windowConfig?: import('./memory/ui/extractionPayload').ExtractionWindowConfig;
    syncTimeoutMs?: number;
    materializeProfile?: boolean;
    getToolManifest?: () => string[];
    behavior?: {
      enabled?: boolean;
      store?: BehaviorStore;
      analyzers?: BehaviorAnalyzer[];
      schedulerPolicy?: Partial<BehaviorSchedulerPolicy>;
      interpreterPolicy?: FindingInterpreterPolicy;
      windowConfig?: import('./memory/ui/extractionPayload').ExtractionWindowConfig;
      aggregateWindowMs?: number;
      syncTimeoutMs?: number;
      captureSnapshots?: boolean;
      materializationThreshold?: number;
      onCapture?: (capture: BehaviorAnalysisRunCapture) => void;
    };
  };
}

export interface HydrationResult {
  themeTokens: Record<string, string>;
}

/** Fully wired runtime services returned by createAnyaRuntime(). */
export interface AnyaRuntime {
  catalog: NodeCatalog;
  workflowRegistry: SkillRegistry;
  viewRegistry: ViewRegistry;
  sessionMemory: ContextMemoryManager;
  userProfile: AdaptiveProfile;
  agentBridge: DynamicOrchestrator;
  runtime: RuntimeStore;
  viewEngine: ViewEngine;
  stateGraph: StateGraph;
  viewRecommendations?: ViewRecommendationEngine;
  storage: FileStorage;
  applyView: (
    spec: ViewSpec,
    options?: {
      source?: RuntimeEventSource;
      userIntent?: string;
      view?: ViewMetadata;
      bindings?: ActionBinding[];
    }
  ) => ApplySpecResult;
  hydrate: () => Promise<HydrationResult>;
  /** Available when uiMemory.enabled is true. */
  uiMemoryStore?: MemoryStore;
  uiEventCollector?: UiEventCollector;
  uiTriggerManager?: TriggerManager;
  uiMemoryPipeline?: UiMemoryPipeline;
  uiBehaviorStore?: BehaviorStore;
  uiBehaviorPipeline?: UiBehaviorPipeline;
}

function registerNodes(catalog: NodeCatalog, nodes: NodeDefinition[]): void {
  for (const component of nodes) {
    catalog.register(component);
  }
}

function registerWorkflows(registry: SkillRegistry, workflows: SkillDefinition[]): void {
  for (const workflow of workflows) {
    registry.register(workflow);
  }
}

function canUseLocalStorage(): boolean {
  try {
    return typeof globalThis.localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function createDefaultStorage(): FileStorage {
  return canUseLocalStorage()
    ? new LocalStorageAdapter()
    : new InMemoryStorage();
}

/**
 * Composition root for core runtime services.
 * Host integrations can use this to avoid wiring every dependency manually.
 */
export function createAnyaRuntime(config?: AnyaRuntimeConfig): AnyaRuntime {
  const storage = config?.storage ?? createDefaultStorage();

  const catalog = new NodeCatalog({
    allowedCapabilities: config?.allowedCapabilities,
  });
  registerNodes(catalog, config?.nodes ?? []);

  const workflowRegistry = new SkillRegistry();
  registerWorkflows(
    workflowRegistry,
    config?.workflows ?? []
  );
  const viewRegistry = new ViewRegistry();
  for (const appView of config?.appViews ?? []) {
    viewRegistry.registerAppView(appView);
  }
  for (const viewTemplate of config?.viewTemplates ?? []) {
    viewRegistry.registerTemplate(viewTemplate);
  }

  const sessionMemory = new ContextMemoryManager({
    storage,
    maxInteractions: config?.maxInteractions,
    maxReasoningTraces: config?.maxReasoningTraces,
    onPersistError: config?.onPersistError,
  });

  const userProfile = new AdaptiveProfile(storage);

  // ── Opt-in UI memory pipeline ──────────────────────────────────────
  let uiMemoryStore: MemoryStore | undefined;
  let uiEventCollector: UiEventCollector | undefined;
  let uiTriggerManager: TriggerManager | undefined;
  let uiRetrieval: RetrievalComposer | undefined;
  let uiMemoryPipeline: UiMemoryPipeline | undefined;
  let uiBehaviorStore: BehaviorStore | undefined;
  let uiBehaviorPipeline: UiBehaviorPipeline | undefined;
  let viewRecommendations: ViewRecommendationEngine | undefined;

  if (config?.uiMemory?.enabled) {
    if (config.uiMemory.store) {
      uiMemoryStore = config.uiMemory.store;
    } else if (config.uiMemory.storePolicy) {
      uiMemoryStore = createMemoryStoreByPolicySync({
        policy: config.uiMemory.storePolicy,
        runtime: config.uiMemory.storeRuntime,
        sqlite: config.uiMemory.sqlite,
        indexeddb: config.uiMemory.indexeddb,
        allowMemoryDowngrade: config.uiMemory.allowMemoryDowngrade,
      });
    } else {
      // Keep deterministic default behavior for hosts/tests:
      // uiMemory is in-memory unless a policy is explicitly requested.
      uiMemoryStore = new InMemoryMemoryStore();
    }
    getLogger().info(
      `[AnyaRuntime] UI memory store initialized: ${uiMemoryStore.constructor?.name ?? 'UnknownStore'}`
    );
    uiTriggerManager = new TriggerManager(config.uiMemory.triggerConfig);
    const sessionId = config.uiMemory.sessionId ?? 'default';
    uiEventCollector = new UiEventCollector(
      uiMemoryStore,
      uiTriggerManager,
      { actorId: config.uiMemory.actorId, sessionId },
    );
    uiRetrieval = new RetrievalComposer(config.uiMemory.retrievalConfig);

    if (config.uiMemory.runPrompt) {
      uiMemoryPipeline = new UiMemoryPipeline({
        actorId: config.uiMemory.actorId,
        sessionId,
        store: uiMemoryStore,
        trigger: uiTriggerManager,
        runPrompt: config.uiMemory.runPrompt,
        windowConfig: config.uiMemory.windowConfig,
        syncTimeoutMs: config.uiMemory.syncTimeoutMs,
        profile: userProfile,
        materializeProfile: config.uiMemory.materializeProfile ?? true,
        getToolManifest: config.uiMemory.getToolManifest,
      });
      uiMemoryPipeline.start();
    } else {
      getLogger().info(
        '[AnyaRuntime] uiMemory is enabled without runPrompt; event collection is active but extraction pipeline is disabled.'
      );
    }

    if (config.uiMemory.behavior?.enabled) {
      uiBehaviorStore = config.uiMemory.behavior.store ?? new InMemoryBehaviorStore();
      const recommendationConfig: ViewRecommendationEngineConfig = {
        actorId: config.uiMemory.actorId,
        behaviorStore: uiBehaviorStore,
        policy: config.uiMemory.behavior.interpreterPolicy ?? DEFAULT_FINDING_INTERPRETER_POLICY,
        ranking: {
          max: config.uiMemory.retrievalConfig?.maxBehaviorAdaptations,
          confidenceWeight: config.uiMemory.retrievalConfig?.confidenceWeight,
          recencyWeight: config.uiMemory.retrievalConfig?.recencyWeight,
          supportWeight: config.uiMemory.retrievalConfig?.supportWeight,
          severityWeight: config.uiMemory.retrievalConfig?.behaviorSeverityWeight,
          contextWeight: config.uiMemory.retrievalConfig?.behaviorContextWeight,
        },
      };
      viewRecommendations = new ViewRecommendationEngine(recommendationConfig);
      const behaviorConfig: UiBehaviorPipelineConfig = {
        actorId: config.uiMemory.actorId,
        eventStore: uiMemoryStore,
        trigger: uiTriggerManager,
        behaviorStore: uiBehaviorStore,
        analyzers: config.uiMemory.behavior.analyzers,
        schedulerPolicy: config.uiMemory.behavior.schedulerPolicy,
        interpreterPolicy: config.uiMemory.behavior.interpreterPolicy ?? (config.uiMemory.behavior.materializationThreshold !== undefined ? {
          ...DEFAULT_FINDING_INTERPRETER_POLICY,
          allowResolvedMemoryPromotion: true,
          promotionRules: {
            preference_candidate: { confidenceMin: config.uiMemory.behavior.materializationThreshold, supportMin: 1 },
            pattern_candidate: { confidenceMin: config.uiMemory.behavior.materializationThreshold, supportMin: 1 },
            reflection_candidate: { confidenceMin: config.uiMemory.behavior.materializationThreshold, supportMin: 1 },
          },
        } : undefined),
        windowConfig: config.uiMemory.behavior.windowConfig ?? config.uiMemory.windowConfig,
        aggregateWindowMs: config.uiMemory.behavior.aggregateWindowMs,
        syncTimeoutMs: config.uiMemory.behavior.syncTimeoutMs ?? config.uiMemory.syncTimeoutMs,
        captureSnapshots: config.uiMemory.behavior.captureSnapshots,
        profile: userProfile,
        materializeProfile: config.uiMemory.materializeProfile ?? true,
      };
      uiBehaviorPipeline = new UiBehaviorPipeline(behaviorConfig);
      uiBehaviorPipeline.setOnCapture(config.uiMemory.behavior.onCapture);
      uiBehaviorPipeline.start();
    }
  }

  const agentBridge = new DynamicOrchestrator({
    catalog,
    skills: workflowRegistry,
    memory: sessionMemory,
    profile: userProfile,
    sessionTransport: config?.sessionTransport,
    ...(uiMemoryStore && uiRetrieval && config?.uiMemory ? {
      uiMemoryStore,
      uiMemoryRetrieval: uiRetrieval,
      uiBehaviorStore,
      uiBehaviorPolicy: uiBehaviorStore
        ? (config.uiMemory.behavior?.interpreterPolicy ?? DEFAULT_FINDING_INTERPRETER_POLICY)
        : undefined,
      actorId: config.uiMemory.actorId,
    } : {}),
  });

  const runtime = createRuntimeStore({
    effects: config?.runtime?.effects,
    reducer: config?.runtime?.reducer,
    onEffectError: config?.runtime?.onEffectError,
    maxDispatchDepth: config?.runtime?.maxDispatchDepth,
    dedupeNestedEventIds: config?.runtime?.dedupeNestedEventIds,
  });

  // Wire runtime events → UI memory collector when enabled
  if (uiEventCollector) {
    runtime.subscribeEvent('*', (event) => {
      uiEventCollector!.collect(event).catch((err) => {
        getLogger().warn('[AnyaRuntime] UI memory event collection failed:', err);
      });
    });
  }

  const memoryContext = sessionMemory.getContext();
  const viewEngine = createViewEngine({
    allowedToolIds: config?.views?.allowedToolIds,
    maxExecutionHistory: config?.views?.maxExecutionHistory,
    initialContext: {
      currentSpec: sessionMemory.getCurrentSpec(),
      sessionHistory: [...sessionMemory.getInteractions()],
      workflowContext: memoryContext.workflowContext,
      availableWorkflows: workflowRegistry.list(),
    },
  });

  if (uiBehaviorPipeline) {
    (uiBehaviorPipeline as any).config.viewEngine = viewEngine;
  }

  const applyView: AnyaRuntime['applyView'] = (spec, options) => {
    const result = applyDecodedSpec(
      spec,
      {
        memory: sessionMemory,
        profile: userProfile,
        viewEngine,
      },
      options
    );

    if (result.profileObservation) {
      runtime.dispatch(
        createRuntimeEvent(
          'preference.explicit',
          {
            category: 'ui',
            key: 'profile_observation',
            value: result.profileObservation,
            statement: result.profileObservation,
          },
          {
            source: options?.source ?? 'system',
          },
        ),
      );
    }

    return result;
  };

  const hydrate = async (): Promise<HydrationResult> => {
    const [, , themeTokens] = await Promise.all([
      userProfile.load(),
      sessionMemory.loadFromDisk(),
      loadThemeTokens(storage),
    ]);

    const context = sessionMemory.getContext();
    const currentSpec = sessionMemory.getCurrentSpec();
    const restoredBindings = currentSpec
      ? extractActionBindings(currentSpec).bindings
      : [];
    viewEngine.setContext({
      workflowContext: context.workflowContext,
      availableWorkflows: workflowRegistry.list(),
      candidateSpec: currentSpec,
      candidateBindings: restoredBindings,
      currentSpec,
      currentBindings: restoredBindings,
      sessionHistory: [...sessionMemory.getInteractions()],
      persistentProfile: userProfile.getContent(),
    });

    return { themeTokens };
  };

  return {
    catalog,
    workflowRegistry,
    viewRegistry,
    sessionMemory,
    userProfile,
    agentBridge,
    runtime,
    viewEngine,
    stateGraph: viewEngine.stateGraph,
    viewRecommendations,
    storage,
    applyView,
    hydrate,
    uiMemoryStore,
    uiEventCollector,
    uiTriggerManager,
    uiMemoryPipeline,
    uiBehaviorStore,
    uiBehaviorPipeline,
  };
}
