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

// ─── Provider Props ──────────────────────────────────────────────────────

export interface AnyaProviderProps {
  components?: AnyaComponent[];
  workflowContexts?: WorkflowContextDefinition[];
  /** Optional capability allowlist enforced for component plugins */
  allowedCapabilities?: ComponentCapability[];
  /** Storage backend for memory persistence (defaults to localStorage) */
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
  /** Opt-in UI memory pipeline. When provided, runtime events are auto-ingested. */
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
