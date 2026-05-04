/**
 * ../react — Provider
 *
 * AnyaProvider sets up the framework context for your app.
 * It accepts node definitions (from defineComponent()) and
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
  type NodeCapability,
  type NodeCatalog,
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
} from '../core';
import {
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
} from '../core/internal';
import type { AnyaNode } from './defineComponent';
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

const AnyaContext = createContext<AnyaContextValue | null>(null);

type MountOnlyProviderProp =
  | 'nodes'
  | 'workflows'
  | 'appViews'
  | 'viewTemplates'
  | 'allowedCapabilities'
  | 'storage'
  | 'uiMemory';

interface ComponentMountSnapshot {
  name: string;
  description: string;
  propsSchema: AnyaNode['propsSchema'];
  render: AnyaNode['render'];
  examples: string[];
  tags: string[];
  capabilities: string[];
  onRegister: AnyaNode['onRegister'];
  onUnregister: AnyaNode['onUnregister'];
}

interface WorkflowMountSnapshot {
  name: string;
  description: string;
  nodes: string[];
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
  filename: string;
  dbName: string;
  dbVersion: string;
  behavior: string;
  store: NonNullable<AnyaRuntimeConfig['uiMemory']>['store'];
  runPrompt: NonNullable<AnyaRuntimeConfig['uiMemory']>['runPrompt'];
  getToolManifest: NonNullable<AnyaRuntimeConfig['uiMemory']>['getToolManifest'];
}

interface ProviderMountSnapshot {
  nodes: ComponentMountSnapshot[];
  workflows: WorkflowMountSnapshot[];
  appViews: string;
  viewTemplates: string;
  allowedCapabilities: string[];
  storage: FileStorage | undefined;
  uiMemory: UiMemoryMountSnapshot | undefined;
}

const MOUNT_ONLY_PROVIDER_PROP_HELP: Record<MountOnlyProviderProp, string> = {
  nodes: 'Use `useAnyaUI().registerNode()` / `unregisterNode()` for runtime node changes, or remount <AnyaProvider>.',
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

function snapshotComponents(nodes: AnyaNode[]): ComponentMountSnapshot[] {
  return nodes.map((node) => ({
    name: node.name,
    description: node.description,
    propsSchema: node.propsSchema,
    render: node.render,
    examples: snapshotStringArray(node.examples),
    tags: snapshotStringArray(node.tags),
    capabilities: snapshotStringArray(node.capabilities),
    onRegister: node.onRegister,
    onUnregister: node.onUnregister,
  }));
}

function snapshotWorkflows(workflows: WorkflowDefinition[]): WorkflowMountSnapshot[] {
  return workflows.map((workflow) => ({
    name: workflow.name,
    description: workflow.description,
    nodes: [...workflow.nodes],
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
          checklist: (workflow.sop.checklist ?? []).map((item: any) => ({
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
    analyzerIds: behavior?.analyzers?.map((analyzer: any) => analyzer.id) ?? [],
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
    filename: stableSerialize(uiMemory.filename),
    dbName: stableSerialize(uiMemory.dbName),
    dbVersion: stableSerialize(uiMemory.dbVersion),
    behavior: snapshotUiBehaviorConfig(uiMemory.behavior),
    store: uiMemory.store,
    runPrompt: uiMemory.runPrompt,
    getToolManifest: uiMemory.getToolManifest,
  };
}

function createProviderMountSnapshot(
  nodes: AnyaNode[],
  workflows: WorkflowDefinition[],
  appViews: AppView[],
  viewTemplates: ViewTemplate[],
  allowedCapabilities: NodeCapability[] | undefined,
  storage: FileStorage | undefined,
  uiMemory: AnyaRuntimeConfig['uiMemory'] | undefined,
): ProviderMountSnapshot {
  return {
    nodes: snapshotComponents(nodes),
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
  return left.every((node, index) => {
    const other = right[index];
    return node.name === other.name
      && node.description === other.description
      && node.propsSchema === other.propsSchema
      && node.render === other.render
      && node.onRegister === other.onRegister
      && node.onUnregister === other.onUnregister
      && areStringArraysEqual(node.examples, other.examples)
      && areStringArraysEqual(node.tags, other.tags)
      && areStringArraysEqual(node.capabilities, other.capabilities);
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
    && left.filename === right.filename
    && left.dbName === right.dbName
    && left.dbVersion === right.dbVersion
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

  if (!areComponentSnapshotsEqual(initial.nodes, current.nodes)) {
    changed.push('nodes');
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
  /** Mount-only node definitions. Runtime changes should go through useAnyaUI(). */
  nodes?: AnyaNode[];
  /** Mount-only workflow definitions. Remount the provider to replace them. */
  workflows?: WorkflowDefinition[];
  /** Mount-only stable app views. Remount the provider to replace them. */
  appViews?: AppView[];
  /** Mount-only reusable view templates. Remount the provider to replace them. */
  viewTemplates?: ViewTemplate[];
  /** Mount-only capability allowlist enforced for node plugins */
  allowedCapabilities?: NodeCapability[];
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
  nodes = [],
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
  const nodeRenderMapRef = useRef<Map<string, ComponentType<any>>>(new Map());
  const nodeMapRef = useRef<Map<string, AnyaNode>>(new Map());
  const initialMountSnapshotRef = useRef<ProviderMountSnapshot | null>(null);
  const warnedMountOnlyPropsRef = useRef<Set<MountOnlyProviderProp>>(new Set());

  const currentMountSnapshot = createProviderMountSnapshot(
    nodes,
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
    node: AnyaNode,
    hook: 'onRegister' | 'onUnregister',
  ) => {
    const fn = node[hook];
    if (!fn) return;
    try {
      fn();
    } catch (error) {
      getLogger().warn(`[AnyaProvider] ${hook} hook failed for node '${node.name}'.`, error);
    }
  }, []);

  if (!runtimeRef.current) {
    const nodeDefs = nodes.map((node) => ({
      name: node.name,
      description: node.description,
      propsSchema: node.propsSchema,
      examples: node.examples,
      tags: node.tags,
      capabilities: node.capabilities,
    }));

    runtimeRef.current = createAnyaRuntime({
      nodes: nodeDefs,
      workflows,
      appViews,
      viewTemplates,
      allowedCapabilities,
      storage,
      onPersistError: (error: any) => {
        getLogger().warn('[AnyaProvider] Failed to persist memory snapshot.', error);
      },
      runtime: {
        onEffectError: (error: any, event: any) => {
          getLogger().warn('[AnyaProvider] Runtime effect failure:', event.type, error);
        },
      },
      ...(uiMemory?.enabled ? { uiMemory } : {}),
    });

    const nodeRenderMap = new Map<string, ComponentType<any>>();
    const nodeMap = new Map<string, AnyaNode>();
    for (const node of nodes) {
      nodeRenderMap.set(node.name, node.render);
      nodeMap.set(node.name, node);
    }
    nodeRenderMapRef.current = nodeRenderMap;
    nodeMapRef.current = nodeMap;
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
    for (const node of nodeMapRef.current.values()) {
      runComponentHook(node, 'onRegister');
    }

    return () => {
      for (const node of nodeMapRef.current.values()) {
        runComponentHook(node, 'onUnregister');
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
      nodeMap: nodeMapRef.current,
      nodeRenderMap: nodeRenderMapRef.current,
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
