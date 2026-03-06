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
  type AdaptiveProfile,
  type AnyaKernel,
  type AnyaKernelConfig,
  type ComponentCapability,
  type ComponentCatalog,
  createAnyaKernel,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
  getLogger,
  type ContextMemoryManager,
  type DynamicOrchestrator,
  type FileStorage,
  type PresentationEngine,
  saveThemeTokens,
  type RuntimeEffect,
  type RuntimeEvent,
  type RuntimeFailureBudgetPolicy,
  type RuntimeFailureBudgetSignal,
  type RuntimeState,
  type RuntimeStore,
  type RuntimeTelemetrySink,
  type WorkflowContextDefinition,
  type WorkflowContextRegistry,
} from '@anya-ui/core';
import type { AnyaComponent } from './defineComponent';

// ─── Context Types ───────────────────────────────────────────────────────

export interface AnyaContextValue {
  catalog: ComponentCatalog;
  workflowContexts: WorkflowContextRegistry;
  memory: ContextMemoryManager;
  profile: AdaptiveProfile;
  orchestrator: DynamicOrchestrator;
  runtime: RuntimeStore;
  presentation: PresentationEngine;
  componentMap: Map<string, ComponentType<any>>;
  pluginMap: Map<string, AnyaComponent>;
  applyThemeUpdate: (update: Record<string, string>) => void;
}

const AnyaContext = createContext<AnyaContextValue | null>(null);

type MountOnlyProviderProp = 'components' | 'workflowContexts' | 'allowedCapabilities' | 'storage' | 'uiMemory';

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
  defaultLayout: WorkflowContextDefinition['defaultLayout'];
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
  storePolicy: NonNullable<AnyaKernelConfig['uiMemory']>['storePolicy'];
  storeRuntime: NonNullable<AnyaKernelConfig['uiMemory']>['storeRuntime'];
  fallbackToMemory: boolean | undefined;
  syncTimeoutMs: number | undefined;
  materializeProfile: boolean | undefined;
  triggerConfig: string;
  retrievalConfig: string;
  windowConfig: string;
  sqlite: string;
  indexeddb: string;
  store: NonNullable<AnyaKernelConfig['uiMemory']>['store'];
  runPrompt: NonNullable<AnyaKernelConfig['uiMemory']>['runPrompt'];
  getToolManifest: NonNullable<AnyaKernelConfig['uiMemory']>['getToolManifest'];
}

interface ProviderMountSnapshot {
  components: ComponentMountSnapshot[];
  workflowContexts: WorkflowMountSnapshot[];
  allowedCapabilities: string[];
  storage: FileStorage | undefined;
  uiMemory: UiMemoryMountSnapshot | undefined;
}

const MOUNT_ONLY_PROVIDER_PROP_HELP: Record<MountOnlyProviderProp, string> = {
  components: 'Use `useAnyaUI().registerComponent()` / `unregisterComponent()` for runtime component changes, or remount <AnyaProvider>.',
  workflowContexts: 'Remount <AnyaProvider> to replace the workflow registry after initialization.',
  allowedCapabilities: 'Remount <AnyaProvider> to apply a new capability allowlist.',
  storage: 'Remount <AnyaProvider> to switch persistence backends.',
  uiMemory: 'Remount <AnyaProvider> to change UI memory configuration.',
};

function snapshotStringArray(values?: readonly string[]): string[] {
  return values ? [...values] : [];
}

function stableSerialize(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
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

function snapshotWorkflowContexts(workflowContexts: WorkflowContextDefinition[]): WorkflowMountSnapshot[] {
  return workflowContexts.map((workflow) => ({
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

function snapshotUiMemoryConfig(uiMemory?: AnyaKernelConfig['uiMemory']): UiMemoryMountSnapshot | undefined {
  if (!uiMemory) return undefined;

  return {
    enabled: uiMemory.enabled,
    actorId: uiMemory.actorId,
    sessionId: uiMemory.sessionId,
    storePolicy: uiMemory.storePolicy,
    storeRuntime: uiMemory.storeRuntime,
    fallbackToMemory: uiMemory.fallbackToMemory,
    syncTimeoutMs: uiMemory.syncTimeoutMs,
    materializeProfile: uiMemory.materializeProfile,
    triggerConfig: stableSerialize(uiMemory.triggerConfig),
    retrievalConfig: stableSerialize(uiMemory.retrievalConfig),
    windowConfig: stableSerialize(uiMemory.windowConfig),
    sqlite: stableSerialize(uiMemory.sqlite),
    indexeddb: stableSerialize(uiMemory.indexeddb),
    store: uiMemory.store,
    runPrompt: uiMemory.runPrompt,
    getToolManifest: uiMemory.getToolManifest,
  };
}

function createProviderMountSnapshot(
  components: AnyaComponent[],
  workflowContexts: WorkflowContextDefinition[],
  allowedCapabilities: ComponentCapability[] | undefined,
  storage: FileStorage | undefined,
  uiMemory: AnyaKernelConfig['uiMemory'] | undefined,
): ProviderMountSnapshot {
  return {
    components: snapshotComponents(components),
    workflowContexts: snapshotWorkflowContexts(workflowContexts),
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
    && left.fallbackToMemory === right.fallbackToMemory
    && left.syncTimeoutMs === right.syncTimeoutMs
    && left.materializeProfile === right.materializeProfile
    && left.triggerConfig === right.triggerConfig
    && left.retrievalConfig === right.retrievalConfig
    && left.windowConfig === right.windowConfig
    && left.sqlite === right.sqlite
    && left.indexeddb === right.indexeddb
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
  if (!areWorkflowSnapshotsEqual(initial.workflowContexts, current.workflowContexts)) {
    changed.push('workflowContexts');
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
  workflowContexts?: WorkflowContextDefinition[];
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
  /** Mount-only UI memory pipeline configuration. Remount to change it. */
  uiMemory?: AnyaKernelConfig['uiMemory'];
  children: ReactNode;
}

// ─── Provider Component ──────────────────────────────────────────────────

export function AnyaProvider({
  components = [],
  workflowContexts = [],
  allowedCapabilities,
  storage,
  onTelemetryEvent,
  telemetryIncludePayload = false,
  failureBudgetPolicy,
  onFailureBudgetSignal,
  onRuntimeEvent,
  uiMemory,
  children,
}: AnyaProviderProps) {
  const kernelRef = useRef<AnyaKernel | null>(null);
  const componentMapRef = useRef<Map<string, ComponentType<any>>>(new Map());
  const pluginMapRef = useRef<Map<string, AnyaComponent>>(new Map());
  const initialMountSnapshotRef = useRef<ProviderMountSnapshot | null>(null);
  const warnedMountOnlyPropsRef = useRef<Set<MountOnlyProviderProp>>(new Set());

  const currentMountSnapshot = createProviderMountSnapshot(
    components,
    workflowContexts,
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

  if (!kernelRef.current) {
    const componentDefs = components.map((component) => ({
      name: component.name,
      description: component.description,
      propsSchema: component.propsSchema,
      examples: component.examples,
      tags: component.tags,
      capabilities: component.capabilities,
    }));

    kernelRef.current = createAnyaKernel({
      components: componentDefs,
      workflowContexts,
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

  const kernel = kernelRef.current!;
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
    const merged = await saveThemeTokens(kernel.storage, update);
    injectCSSVars(merged);
  }, [injectCSSVars, kernel.storage]);

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
    const effects: RuntimeEffect[] = createDefaultRuntimeEffects({
      memory: kernel.memory,
      profile: kernel.profile,
      presentation: kernel.presentation,
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

    kernel.runtime.replaceEffects(effects);
  }, [
    applyThemeUpdate,
    failureBudgetPolicy,
    kernel.memory,
    kernel.presentation,
    kernel.profile,
    kernel.runtime,
    onFailureBudgetSignal,
    onRuntimeEvent,
    onTelemetryEvent,
    telemetryIncludePayload,
  ]);

  React.useEffect(() => {
    const unsubscribe = kernel.workflowContexts.onChange(() => {
      const workflows = kernel.workflowContexts.list();
      kernel.presentation.setContext({
        availableWorkflowContexts: workflows,
      });
    });

    return unsubscribe;
  }, [kernel.presentation, kernel.workflowContexts]);

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
      const { themeTokens } = await kernel.hydrate();
      if (cancelled) return;

      injectCSSVars(themeTokens);

      const ctx = kernel.memory.getContext();
      kernel.runtime.dispatch(createRuntimeEvent('memory.hydrated', {
        state: {
          session: {
            userIntent: ctx.userIntent || undefined,
            workflowContext: ctx.workflowContext,
          },
          ui: {
            spec: kernel.memory.getCurrentSpec(),
            schemaVersion: 1,
          },
          memory: {
            interactions: [...kernel.memory.getInteractions()],
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
  }, [injectCSSVars, kernel]);

  const value = useMemo<AnyaContextValue>(
    () => ({
      catalog: kernel.catalog,
      workflowContexts: kernel.workflowContexts,
      memory: kernel.memory,
      profile: kernel.profile,
      orchestrator: kernel.orchestrator,
      runtime: kernel.runtime,
      presentation: kernel.presentation,
      componentMap: componentMapRef.current,
      pluginMap: pluginMapRef.current,
      applyThemeUpdate,
    }),
    [applyThemeUpdate, kernel]
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
