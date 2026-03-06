/**
 * Kernel composition root.
 * Wires catalog, workflow contexts, memory, runtime, and presentation engine
 * so hosts can bootstrap Anya with one call.
 */
import {
  ComponentCatalog,
  type ComponentCapability,
  type ComponentDefinition,
} from './registry/catalog';
import { SkillRegistry, type SkillDefinition } from './registry/skills';
import { ContextMemoryManager } from './memory/context';
import { AdaptiveProfile } from './memory/profile';
import { DynamicOrchestrator } from './orchestrator';
import { LocalStorageAdapter } from './storage/localStorage';
import { InMemoryStorage } from './storage/memory';
import type { FileStorage } from './storage/interface';
import type { ModelTransport } from './transport/interface';
import {
  createRuntimeEvent,
  createRuntimeStore,
  type RuntimeEffect,
  type RuntimeEffectErrorHandler,
  type RuntimeReducer,
  type RuntimeStore,
} from './runtime';
import { createPresentationEngine, type PresentationEngine } from './presentation/uiEngine';
import { extractBindingsFromSpec } from './presentation/uiBuilder';
import { loadThemeTokens } from './theme';
import type { RuntimeEventSource } from './runtime/events';
import type { UIRenderSpec } from './types';
import { getLogger } from './logging';
import type { MemoryStore } from './memory/ui/store';
import { RetrievalComposer } from './memory/ui/retrieval';
import { InMemoryMemoryStore } from './memory/ui/inMemoryAdapter';
import { UiEventCollector } from './memory/ui/eventCollector';
import { TriggerManager } from './memory/ui/triggerManager';
import { UiMemoryPipeline } from './memory/ui/pipeline';
import {
  createMemoryStoreByPolicySync,
  type MemoryStorePolicy,
  type MemoryStoreRuntime,
} from './memory/ui/storeFactory';
import type { IndexedDbMemoryStoreOptions } from './memory/ui/indexedDbAdapter';
import type { SQLiteMemoryStoreOptions } from './memory/ui/sqliteAdapter';
import { applyDecodedSpec, type ApplySpecResult } from './specLifecycle';

export interface AnyaKernelConfig {
  components?: ComponentDefinition[];
  workflowContexts?: SkillDefinition[];
  allowedCapabilities?: ComponentCapability[];
  storage?: FileStorage;
  transport?: ModelTransport;
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
  presentation?: {
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
    fallbackToMemory?: boolean;
    triggerConfig?: import('./memory/ui/triggerManager').TriggerConfig;
    retrievalConfig?: import('./memory/ui/retrieval').RetrievalConfig;
    runPrompt?: import('./memory/ui/extractionWorker').PromptRunner;
    windowConfig?: import('./memory/ui/extractionPayload').ExtractionWindowConfig;
    syncTimeoutMs?: number;
    materializeProfile?: boolean;
    getToolManifest?: () => string[];
  };
}

export interface HydrationResult {
  themeTokens: Record<string, string>;
}

/** Fully wired runtime services returned by createAnyaKernel(). */
export interface AnyaKernel {
  catalog: ComponentCatalog;
  workflowContexts: SkillRegistry;
  memory: ContextMemoryManager;
  profile: AdaptiveProfile;
  orchestrator: DynamicOrchestrator;
  runtime: RuntimeStore;
  presentation: PresentationEngine;
  storage: FileStorage;
  applySpec: (
    spec: UIRenderSpec,
    options?: { source?: RuntimeEventSource; userIntent?: string }
  ) => ApplySpecResult;
  hydrate: () => Promise<HydrationResult>;
  /** Available when uiMemory.enabled is true. */
  uiMemoryStore?: MemoryStore;
  uiEventCollector?: UiEventCollector;
  uiTriggerManager?: TriggerManager;
  uiMemoryPipeline?: UiMemoryPipeline;
}

function registerComponents(catalog: ComponentCatalog, components: ComponentDefinition[]): void {
  for (const component of components) {
    catalog.register(component);
  }
}

function registerWorkflowContexts(registry: SkillRegistry, workflowContexts: SkillDefinition[]): void {
  for (const workflow of workflowContexts) {
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
export function createAnyaKernel(config?: AnyaKernelConfig): AnyaKernel {
  const storage = config?.storage ?? createDefaultStorage();

  const catalog = new ComponentCatalog({
    allowedCapabilities: config?.allowedCapabilities,
  });
  registerComponents(catalog, config?.components ?? []);

  const workflowContexts = new SkillRegistry();
  registerWorkflowContexts(
    workflowContexts,
    config?.workflowContexts ?? []
  );

  const memory = new ContextMemoryManager({
    storage,
    maxInteractions: config?.maxInteractions,
    maxReasoningTraces: config?.maxReasoningTraces,
    onPersistError: config?.onPersistError,
  });

  const profile = new AdaptiveProfile(storage);

  // ── Opt-in UI memory pipeline ──────────────────────────────────────
  let uiMemoryStore: MemoryStore | undefined;
  let uiEventCollector: UiEventCollector | undefined;
  let uiTriggerManager: TriggerManager | undefined;
  let uiRetrieval: RetrievalComposer | undefined;
  let uiMemoryPipeline: UiMemoryPipeline | undefined;

  if (config?.uiMemory?.enabled) {
    if (config.uiMemory.store) {
      uiMemoryStore = config.uiMemory.store;
    } else if (config.uiMemory.storePolicy) {
      uiMemoryStore = createMemoryStoreByPolicySync({
        policy: config.uiMemory.storePolicy,
        runtime: config.uiMemory.storeRuntime,
        sqlite: config.uiMemory.sqlite,
        indexeddb: config.uiMemory.indexeddb,
        fallbackToMemory: config.uiMemory.fallbackToMemory,
      });
    } else {
      // Keep deterministic default behavior for hosts/tests:
      // uiMemory is in-memory unless a policy is explicitly requested.
      uiMemoryStore = new InMemoryMemoryStore();
    }
    getLogger().info(
      `[AnyaKernel] UI memory store initialized: ${uiMemoryStore.constructor?.name ?? 'UnknownStore'}`
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
        profile,
        materializeProfile: config.uiMemory.materializeProfile ?? true,
        getToolManifest: config.uiMemory.getToolManifest,
      });
      uiMemoryPipeline.start();
    } else {
      getLogger().info(
        '[AnyaKernel] uiMemory is enabled without runPrompt; event collection is active but extraction pipeline is disabled.'
      );
    }
  }

  const orchestrator = new DynamicOrchestrator({
    catalog,
    skills: workflowContexts,
    memory,
    profile,
    transport: config?.transport,
    ...(uiMemoryStore && uiRetrieval && config?.uiMemory ? {
      uiMemoryStore,
      uiMemoryRetrieval: uiRetrieval,
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
        getLogger().warn('[AnyaKernel] UI memory event collection failed:', err);
      });
    });
  }

  const memoryContext = memory.getContext();
  const presentation = createPresentationEngine({
    allowedToolIds: config?.presentation?.allowedToolIds,
    maxExecutionHistory: config?.presentation?.maxExecutionHistory,
    initialContext: {
      currentSpec: memory.getCurrentSpec(),
      sessionHistory: [...memory.getInteractions()],
      workflowContext: memoryContext.workflowContext,
      availableWorkflowContexts: workflowContexts.list(),
    },
  });

  const applySpec: AnyaKernel['applySpec'] = (spec, options) => {
    const result = applyDecodedSpec(
      spec,
      {
        memory,
        profile,
        presentation,
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
      profile.load(),
      memory.loadFromDisk(),
      loadThemeTokens(storage),
    ]);

    const context = memory.getContext();
    const currentSpec = memory.getCurrentSpec();
    const restoredBindings = currentSpec
      ? extractBindingsFromSpec(currentSpec).bindings
      : [];
    presentation.setContext({
      workflowContext: context.workflowContext,
      availableWorkflowContexts: workflowContexts.list(),
      candidateSpec: currentSpec,
      candidateBindings: restoredBindings,
      currentSpec,
      currentBindings: restoredBindings,
      sessionHistory: [...memory.getInteractions()],
      persistentProfile: profile.getContent(),
    });

    return { themeTokens };
  };

  return {
    catalog,
    workflowContexts,
    memory,
    profile,
    orchestrator,
    runtime,
    presentation,
    storage,
    applySpec,
    hydrate,
    uiMemoryStore,
    uiEventCollector,
    uiTriggerManager,
    uiMemoryPipeline,
  };
}
