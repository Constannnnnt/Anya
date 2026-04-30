/**
 * @anya-ui/react — Provider
 *
 * AnyaProvider sets up the framework context for your app.
 * It accepts component definitions (from defineComponent()) and
 * optional workflow contexts. No LLM/agent coupling — you bring your own.
 */

import React, {
  createContext,
  useContext,
  useRef,
  useMemo,
  type ReactNode,
  type ComponentType,
} from 'react';
import {
  type AgentBridge,
  type AnyaRuntime,
  type AnyaRuntimeConfig,
  type ComponentCapability,
  type ComponentCatalog,
  createAnyaRuntime,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  getLogger,
  type AppView,
  type FileStorage,
  type SessionMemory,
  saveThemeTokens,
  type RuntimeEffect,
  type RuntimeEvent,
  type RuntimeFailureBudgetPolicy,
  type RuntimeFailureBudgetSignal,
  type RuntimeState,
  type RuntimeStore,
  type StateGraph,
  type UserProfile,
  type ViewRecommendationEngine,
  type RuntimeTelemetrySink,
  type ViewRegistry,
  type ViewTemplate,
  type ViewEngine,
  type WorkflowDefinition,
  type WorkflowRegistry,
} from '@anya-ui/core';
import {
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
} from '@anya-ui/core/internal';
import type { AnyaComponent } from './defineComponent';
import { stableSerialize } from './utils/stableSerialize';

type BehaviorAnalysisRunCapture = Parameters<
  NonNullable<
    NonNullable<
      NonNullable<AnyaRuntimeConfig['uiMemory']>['behavior']
    >['onCapture']
  >
>[0];

// ─── Context Types ───────────────────────────────────────────────────────

export interface AnyaContextValue {
  catalog: ComponentCatalog;
  workflowRegistry: WorkflowRegistry;
  viewRegistry: ViewRegistry;
  sessionMemory: SessionMemory;
  userProfile: UserProfile;
  agentBridge: AgentBridge;
  runtime: RuntimeStore;
  viewEngine: ViewEngine;
  stateGraph: StateGraph;
  viewRecommendations?: ViewRecommendationEngine;
  componentMap: Map<string, ComponentType<any>>;
  pluginMap: Map<string, AnyaComponent>;
  applyThemeUpdate: (update: Record<string, string>) => void;
}

const AnyaContext = createContext<AnyaContextValue | null>(null);

type MountOnlyProviderProp =
  | 'components'
  | 'workflows'
  | 'appViews'
  | 'viewTemplates'
  | 'allowedCapabilities'
  | 'storage'
  | 'uiMemory';

interface ComponentMountSnapshot {
  name: string;
  description: string;
  propsSchema: AnyaComponent['propsSchema'];
  render: AnyaComponent['render'];
  examples: string[];
  tags: string[];
  capabilities: string[];
  onRegister: AnyaComponent['onRegister'];
  onUnregister: AnyaComponent['onUnregister'];
}

interface WorkflowMountSnapshot {
  name: string;
  description: string;
  components: string[];
  contextInputs: string[];
  outputExpectations: string[];
  expandable: boolean;
  defaultLayout: WorkflowDefinition['defaultLayout'];
  sop?: {
    objective: string;
    whenToUse: string[];
    steps: string[];
    guardrails: string[];
    checklist: Array<{
      id: string;
      title: string;
      doneWhen: string;
      required: boolean;
    }>;
  };
}

interface UiMemoryMountSnapshot {
  enabled: boolean;
  actorId: string;
  sessionId: string | undefined;
  storePolicy: NonNullable<AnyaRuntimeConfig['uiMemory']>['storePolicy'];
  storeRuntime: NonNullable<AnyaRuntimeConfig['uiMemory']>['storeRuntime'];
  allowMemoryDowngrade: boolean | undefined;
  syncTimeoutMs: number | undefined;
  materializeProfile: boolean | undefined;
  triggerConfig: string;
  retrievalConfig: string;
  windowConfig: string;
  sqlite: string;
  indexeddb: string;
  behavior: string;
  store: NonNullable<AnyaRuntimeConfig['uiMemory']>['store'];
  runPrompt: NonNullable<AnyaRuntimeConfig['uiMemory']>['runPrompt'];
  getToolManifest: NonNullable<AnyaRuntimeConfig['uiMemory']>['getToolManifest'];
}

interface ProviderMountSnapshot {
  components: ComponentMountSnapshot[];
  workflows: WorkflowMountSnapshot[];
  appViews: string;
  viewTemplates: string;
  allowedCapabilities: string[];
  storage: FileStorage | undefined;
  uiMemory: UiMemoryMountSnapshot | undefined;
}

const MOUNT_ONLY_PROVIDER_PROP_HELP: Record<MountOnlyProviderProp, string> = {
  components: 'Use `useAnyaUI().registerComponent()` / `unregisterComponent()` for runtime component changes, or remount <AnyaProvider>.',
  workflows: 'Remount <AnyaProvider> to replace the workflow registry after initialization.',
  appViews: 'Use `useAnya().view.registerApp()` for runtime app view changes, or remount <AnyaProvider>.',
  viewTemplates: 'Use `useAnya().view.registerTemplate()` for runtime template changes, or remount <AnyaProvider>.',
  allowedCapabilities: 'Remount <AnyaProvider> to apply a new capability allowlist.',
  storage: 'Remount <AnyaProvider> to switch persistence backends.',
  uiMemory: 'Remount <AnyaProvider> to change UI memory configuration.',
};

function snapshotStringArray(values?: readonly string[]): string[] {
  return values ? [...values] : [];
}

function snapshotComponents(components: AnyaComponent[]): ComponentMountSnapshot[] {
  return components.map((component) => ({
    name: component.name,
    description: component.description,
    propsSchema: component.propsSchema,
    render: component.render,
    examples: snapshotStringArray(component.examples),
    tags: snapshotStringArray(component.tags),
    capabilities: snapshotStringArray(component.capabilities),
    onRegister: component.onRegister,
    onUnregister: component.onUnregister,
  }));
}

function snapshotWorkflows(workflows: WorkflowDefinition[]): WorkflowMountSnapshot[] {
  return workflows.map((workflow) => ({
    name: workflow.name,
    description: workflow.description,
    components: [...workflow.components],
    contextInputs: snapshotStringArray(workflow.contextInputs),
    outputExpectations: snapshotStringArray(workflow.outputExpectations),
    expandable: workflow.expandable ?? false,
    defaultLayout: workflow.defaultLayout,
    sop: workflow.sop
      ? {
          objective: workflow.sop.objective,
          whenToUse: snapshotStringArray(workflow.sop.whenToUse),
          steps: snapshotStringArray(workflow.sop.steps),
          guardrails: snapshotStringArray(workflow.sop.guardrails),
          checklist: (workflow.sop.checklist ?? []).map((item) => ({
            id: item.id,
            title: item.title,
            doneWhen: item.doneWhen,
            required: item.required !== false,
          })),
        }
      : undefined,
  }));
}

function snapshotAppViews(appViews: AppView[]): string {
  return stableSerialize(appViews);
}

function snapshotViewTemplates(viewTemplates: ViewTemplate[]): string {
  return stableSerialize(viewTemplates);
}

function snapshotUiBehaviorConfig(
  behavior?: NonNullable<AnyaRuntimeConfig['uiMemory']>['behavior'],
): string {
  return stableSerialize({
    enabled: behavior?.enabled ?? false,
    aggregateWindowMs: behavior?.aggregateWindowMs,
    syncTimeoutMs: behavior?.syncTimeoutMs,
    windowConfig: behavior?.windowConfig,
    schedulerPolicy: behavior?.schedulerPolicy,
    analyzerIds: behavior?.analyzers?.map((analyzer) => analyzer.id) ?? [],
    captureSnapshots: behavior?.captureSnapshots ?? false,
    hasStore: Boolean(behavior?.store),
    hasInterpreterPolicy: Boolean(behavior?.interpreterPolicy),
  });
}

function snapshotUiMemoryConfig(uiMemory?: AnyaRuntimeConfig['uiMemory']): UiMemoryMountSnapshot | undefined {
  if (!uiMemory) return undefined;

  return {
    enabled: uiMemory.enabled,
    actorId: uiMemory.actorId,
    sessionId: uiMemory.sessionId,
    storePolicy: uiMemory.storePolicy,
    storeRuntime: uiMemory.storeRuntime,
    allowMemoryDowngrade: uiMemory.allowMemoryDowngrade,
    syncTimeoutMs: uiMemory.syncTimeoutMs,
    materializeProfile: uiMemory.materializeProfile,
    triggerConfig: stableSerialize(uiMemory.triggerConfig),
    retrievalConfig: stableSerialize(uiMemory.retrievalConfig),
    windowConfig: stableSerialize(uiMemory.windowConfig),
    sqlite: stableSerialize(uiMemory.sqlite),
    indexeddb: stableSerialize(uiMemory.indexeddb),
    behavior: snapshotUiBehaviorConfig(uiMemory.behavior),
    store: uiMemory.store,
    runPrompt: uiMemory.runPrompt,
    getToolManifest: uiMemory.getToolManifest,
  };
}

function createProviderMountSnapshot(
  components: AnyaComponent[],
  workflows: WorkflowDefinition[],
  appViews: AppView[],
  viewTemplates: ViewTemplate[],
  allowedCapabilities: ComponentCapability[] | undefined,
  storage: FileStorage | undefined,
  uiMemory: AnyaRuntimeConfig['uiMemory'] | undefined,
): ProviderMountSnapshot {
  return {
    components: snapshotComponents(components),
    workflows: snapshotWorkflows(workflows),
    appViews: snapshotAppViews(appViews),
    viewTemplates: snapshotViewTemplates(viewTemplates),
    allowedCapabilities: snapshotStringArray(allowedCapabilities),
    storage,
    uiMemory: snapshotUiMemoryConfig(uiMemory),
  };
}

function areStringArraysEqual(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function areComponentSnapshotsEqual(
  left: ComponentMountSnapshot[],
  right: ComponentMountSnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((component, index) => {
    const other = right[index];
    return component.name === other.name
      && component.description === other.description
      && component.propsSchema === other.propsSchema
      && component.render === other.render
      && component.onRegister === other.onRegister
      && component.onUnregister === other.onUnregister
      && areStringArraysEqual(component.examples, other.examples)
      && areStringArraysEqual(component.tags, other.tags)
      && areStringArraysEqual(component.capabilities, other.capabilities);
  });
}

function areWorkflowSnapshotsEqual(
  left: WorkflowMountSnapshot[],
  right: WorkflowMountSnapshot[],
): boolean {
  if (left.length !== right.length) return false;
  return left.every((workflow, index) => stableSerialize(workflow) === stableSerialize(right[index]));
}

function areUiMemorySnapshotsEqual(
  left: UiMemoryMountSnapshot | undefined,
  right: UiMemoryMountSnapshot | undefined,
): boolean {
  if (!left || !right) return left === right;
  return left.enabled === right.enabled
    && left.actorId === right.actorId
    && left.sessionId === right.sessionId
    && left.storePolicy === right.storePolicy
    && left.storeRuntime === right.storeRuntime
    && left.allowMemoryDowngrade === right.allowMemoryDowngrade
    && left.syncTimeoutMs === right.syncTimeoutMs
    && left.materializeProfile === right.materializeProfile
    && left.triggerConfig === right.triggerConfig
    && left.retrievalConfig === right.retrievalConfig
    && left.windowConfig === right.windowConfig
    && left.sqlite === right.sqlite
    && left.indexeddb === right.indexeddb
    && left.behavior === right.behavior
    && left.store === right.store
    && left.runPrompt === right.runPrompt
    && left.getToolManifest === right.getToolManifest;
}

function collectChangedMountOnlyProviderProps(
  initial: ProviderMountSnapshot,
  current: ProviderMountSnapshot,
): MountOnlyProviderProp[] {
  const changed: MountOnlyProviderProp[] = [];

  if (!areComponentSnapshotsEqual(initial.components, current.components)) {
    changed.push('components');
  }
  if (!areWorkflowSnapshotsEqual(initial.workflows, current.workflows)) {
    changed.push('workflows');
  }
  if (initial.appViews !== current.appViews) {
    changed.push('appViews');
  }
  if (initial.viewTemplates !== current.viewTemplates) {
    changed.push('viewTemplates');
  }
  if (!areStringArraysEqual(initial.allowedCapabilities, current.allowedCapabilities)) {
    changed.push('allowedCapabilities');
  }
  if (initial.storage !== current.storage) {
    changed.push('storage');
  }
  if (!areUiMemorySnapshotsEqual(initial.uiMemory, current.uiMemory)) {
    changed.push('uiMemory');
  }

  return changed;
}

// ─── Provider Props ──────────────────────────────────────────────────────

export interface AnyaProviderProps {
  /** Mount-only component definitions. Runtime changes should go through useAnyaUI(). */
  components?: AnyaComponent[];
  /** Mount-only workflow definitions. Remount the provider to replace them. */
  workflows?: WorkflowDefinition[];
  /** Mount-only stable app views. Remount the provider to replace them. */
  appViews?: AppView[];
  /** Mount-only reusable view templates. Remount the provider to replace them. */
  viewTemplates?: ViewTemplate[];
  /** Mount-only capability allowlist enforced for component plugins */
  allowedCapabilities?: ComponentCapability[];
  /** Mount-only storage backend for memory persistence (defaults to localStorage) */
  storage?: FileStorage;
  /** Optional runtime telemetry sink for observability */
  onTelemetryEvent?: RuntimeTelemetrySink;
  /** Whether telemetry should include runtime event payloads */
  telemetryIncludePayload?: boolean;
  /** Optional failure budget policy for SLO-style alerting */
  failureBudgetPolicy?: RuntimeFailureBudgetPolicy;
  /** Callback for failure budget threshold transitions */
  onFailureBudgetSignal?: (signal: RuntimeFailureBudgetSignal) => void;
  /** Optional side-effect hook for runtime events (e.g. LLM orchestration) */
  onRuntimeEvent?: (event: RuntimeEvent, state: RuntimeState) => void | Promise<void>;
  /** Optional callback for completed behavior-analysis runs and replay capture. */
  onBehaviorAnalysisRun?: (capture: BehaviorAnalysisRunCapture) => void;
  /** Mount-only UI memory pipeline configuration. Remount to change it. */
  uiMemory?: AnyaRuntimeConfig['uiMemory'];
  children: ReactNode;
}

// ─── Provider Component ──────────────────────────────────────────────────

export function AnyaProvider({
  components = [],
  workflows = [],
  appViews = [],
  viewTemplates = [],
  allowedCapabilities,
  storage,
  onTelemetryEvent,
  telemetryIncludePayload = false,
  failureBudgetPolicy,
  onFailureBudgetSignal,
  onRuntimeEvent,
  onBehaviorAnalysisRun,
  uiMemory,
  children,
}: AnyaProviderProps) {
  const runtimeRef = useRef<AnyaRuntime | null>(null);
  const componentMapRef = useRef<Map<string, ComponentType<any>>>(new Map());
  const pluginMapRef = useRef<Map<string, AnyaComponent>>(new Map());
  const initialMountSnapshotRef = useRef<ProviderMountSnapshot | null>(null);
  const warnedMountOnlyPropsRef = useRef<Set<MountOnlyProviderProp>>(new Set());

  const currentMountSnapshot = createProviderMountSnapshot(
    components,
    workflows,
    appViews,
    viewTemplates,
    allowedCapabilities,
    storage,
    uiMemory,
  );

  if (!initialMountSnapshotRef.current) {
    initialMountSnapshotRef.current = currentMountSnapshot;
  }

  const runComponentHook = React.useCallback((
    component: AnyaComponent,
    hook: 'onRegister' | 'onUnregister',
  ) => {
    const fn = component[hook];
    if (!fn) return;
    try {
      fn();
    } catch (error) {
      getLogger().warn(`[AnyaProvider] ${hook} hook failed for component '${component.name}'.`, error);
    }
  }, []);

  if (!runtimeRef.current) {
    const componentDefs = components.map((component) => ({
      name: component.name,
      description: component.description,
      propsSchema: component.propsSchema,
      examples: component.examples,
      tags: component.tags,
      capabilities: component.capabilities,
    }));

    runtimeRef.current = createAnyaRuntime({
      components: componentDefs,
      workflows,
      appViews,
      viewTemplates,
      allowedCapabilities,
      storage,
      onPersistError: (error) => {
        getLogger().warn('[AnyaProvider] Failed to persist memory snapshot.', error);
      },
      runtime: {
        onEffectError: (error, event) => {
          getLogger().warn('[AnyaProvider] Runtime effect failure:', event.type, error);
        },
      },
      ...(uiMemory?.enabled ? { uiMemory } : {}),
    });

    const componentMap = new Map<string, ComponentType<any>>();
    const pluginMap = new Map<string, AnyaComponent>();
    for (const component of components) {
      componentMap.set(component.name, component.render);
      pluginMap.set(component.name, component);
    }
    componentMapRef.current = componentMap;
    pluginMapRef.current = pluginMap;
  }

  const runtimeServices = runtimeRef.current!;
  const wrapperRef = useRef<HTMLDivElement>(null);

  const normalizeThemeTokenKey = React.useCallback((key: string): string => {
    const trimmed = key.trim();
    if (!trimmed) return '';
    const withoutCssPrefix = trimmed.startsWith('--')
      ? trimmed.slice(2)
      : trimmed;
    return withoutCssPrefix.startsWith('anya-')
      ? withoutCssPrefix.slice('anya-'.length)
      : withoutCssPrefix;
  }, []);

  const injectCSSVars = React.useCallback((theme: Record<string, string>) => {
    if (!wrapperRef.current) return;
    Object.entries(theme).forEach(([key, val]) => {
      const normalizedKey = normalizeThemeTokenKey(key);
      if (!normalizedKey) return;
      wrapperRef.current!.style.setProperty(`--anya-${normalizedKey}`, val);
    });
  }, [normalizeThemeTokenKey]);

  const applyThemeUpdate = React.useCallback(async (update: Record<string, string>) => {
    const merged = await saveThemeTokens(runtimeServices.storage, update);
    injectCSSVars(merged);
  }, [injectCSSVars, runtimeServices.storage]);

  React.useEffect(() => {
    const initialSnapshot = initialMountSnapshotRef.current;
    if (!initialSnapshot) return;

    const changedProps = collectChangedMountOnlyProviderProps(initialSnapshot, currentMountSnapshot);
    for (const prop of changedProps) {
      if (warnedMountOnlyPropsRef.current.has(prop)) continue;
      warnedMountOnlyPropsRef.current.add(prop);
      getLogger().warn(
        `[AnyaProvider] '${prop}' is mount-only. Changes after the initial render are ignored. ${MOUNT_ONLY_PROVIDER_PROP_HELP[prop]}`
      );
    }
  }, [currentMountSnapshot]);

  React.useEffect(() => {
    runtimeServices.uiBehaviorPipeline?.setOnCapture(onBehaviorAnalysisRun);
  }, [runtimeServices.uiBehaviorPipeline, onBehaviorAnalysisRun]);

  React.useEffect(() => {
    const effects: RuntimeEffect[] = createDefaultRuntimeEffects({
      memory: runtimeServices.sessionMemory,
      profile: runtimeServices.userProfile,
      viewEngine: runtimeServices.viewEngine,
      onThemeUpdated: applyThemeUpdate,
      onRuntimeEvent,
    });

    if (onTelemetryEvent) {
      effects.push(createRuntimeTelemetryEffect({
        sink: onTelemetryEvent,
        includePayload: telemetryIncludePayload,
      }));
    }

    if (onFailureBudgetSignal) {
      effects.push(createRuntimeFailureBudgetEffect({
        policy: failureBudgetPolicy,
        onSignal: onFailureBudgetSignal,
      }));
    }

    runtimeServices.runtime.replaceEffects(effects);
  }, [
    applyThemeUpdate,
    failureBudgetPolicy,
    runtimeServices.runtime,
    runtimeServices.sessionMemory,
    runtimeServices.userProfile,
    runtimeServices.viewEngine,
    onFailureBudgetSignal,
    onRuntimeEvent,
    onTelemetryEvent,
    telemetryIncludePayload,
  ]);

  React.useEffect(() => {
    const unsubscribe = runtimeServices.workflowRegistry.onChange(() => {
      const workflows = runtimeServices.workflowRegistry.list();
      runtimeServices.viewEngine.setContext({
        availableWorkflows: workflows,
      });
    });

    return unsubscribe;
  }, [runtimeServices.viewEngine, runtimeServices.workflowRegistry]);

  React.useEffect(() => {
    for (const component of pluginMapRef.current.values()) {
      runComponentHook(component, 'onRegister');
    }

    return () => {
      for (const component of pluginMapRef.current.values()) {
        runComponentHook(component, 'onUnregister');
      }
    };
  }, [runComponentHook]);

  React.useEffect(() => {
    let cancelled = false;

    void (async () => {
      const { themeTokens } = await runtimeServices.hydrate();
      if (cancelled) return;

      injectCSSVars(themeTokens);

      const ctx = runtimeServices.sessionMemory.getContext();
      runtimeServices.runtime.dispatch(createRuntimeEvent('memory.hydrated', {
        state: {
          session: {
            userIntent: ctx.userIntent || undefined,
            workflowContext: ctx.workflowContext,
          },
          ui: {
            spec: runtimeServices.sessionMemory.getCurrentSpec(),
            schemaVersion: 1,
          },
          memory: {
            interactions: [...runtimeServices.sessionMemory.getInteractions()],
          },
          theme: {
            tokens: themeTokens,
          },
        },
      }, { source: 'system' }));
    })();

    return () => {
      cancelled = true;
    };
  }, [injectCSSVars, runtimeServices]);

  const value = useMemo<AnyaContextValue>(
    () => ({
      catalog: runtimeServices.catalog,
      workflowRegistry: runtimeServices.workflowRegistry,
      viewRegistry: runtimeServices.viewRegistry,
      sessionMemory: runtimeServices.sessionMemory,
      userProfile: runtimeServices.userProfile,
      agentBridge: runtimeServices.agentBridge,
      runtime: runtimeServices.runtime,
      viewEngine: runtimeServices.viewEngine,
      stateGraph: runtimeServices.stateGraph,
      viewRecommendations: runtimeServices.viewRecommendations,
      componentMap: componentMapRef.current,
      pluginMap: pluginMapRef.current,
      applyThemeUpdate,
    }),
    [applyThemeUpdate, runtimeServices]
  );

  return (
    <AnyaContext.Provider value={value}>
      <div ref={wrapperRef} className="anya-root" style={{ width: '100%', height: '100%', display: 'contents' }}>
        {children}
      </div>
    </AnyaContext.Provider>
  );
}

// ─── Hook ────────────────────────────────────────────────────────────────

export function useAnyaContext(): AnyaContextValue {
  const ctx = useContext(AnyaContext);
  if (!ctx) {
    throw new Error('useAnyaContext must be used within an <AnyaProvider>');
  }
  return ctx;
}
