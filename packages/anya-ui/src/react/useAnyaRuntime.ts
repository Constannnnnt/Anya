import { useRef, useMemo, useEffect, useCallback } from 'react';
import {
  type AnyaRuntime,
  type AnyaRuntimeConfig,
  createAnyaRuntime,
  createDefaultRuntimeEffects,
  createRuntimeEvent,
  getLogger,
  saveThemeTokens,
  type RuntimeEffect,
  type RuntimeEvent,
  type RuntimeState,
  type RuntimeTelemetrySink,
  type RuntimeFailureBudgetPolicy,
  type RuntimeFailureBudgetSignal,
} from '../core';
import {
  createRuntimeFailureBudgetEffect,
  createRuntimeTelemetryEffect,
} from '../core/internal';
import type { AnyaNode } from './defineComponent';

export interface UseAnyaRuntimeOptions extends AnyaRuntimeConfig {
  nodes?: AnyaNode[];
  onTelemetryEvent?: RuntimeTelemetrySink;
  telemetryIncludePayload?: boolean;
  failureBudgetPolicy?: RuntimeFailureBudgetPolicy;
  onFailureBudgetSignal?: (signal: RuntimeFailureBudgetSignal) => void;
  onRuntimeEvent?: (event: RuntimeEvent, state: RuntimeState) => void | Promise<void>;
  onBehaviorAnalysisRun?: (capture: any) => void;
  injectCSSVars?: (theme: Record<string, string>) => void;
}

export function useAnyaRuntime({
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
  injectCSSVars,
  ...otherConfig
}: UseAnyaRuntimeOptions): AnyaRuntime {
  const runtimeRef = useRef<AnyaRuntime | null>(null);

  if (!runtimeRef.current) {
    const nodeDefs = nodes.map((node) => ({
      name: node.name,
      description: node.description,
      propsSchema: node.propsSchema,
      examples: node.examples,
      tags: node.tags,
      capabilities: node.capabilities,
    }));

    const behaviorConfig = uiMemory?.behavior ? {
      ...uiMemory.behavior,
      onCapture: (capture: any) => {
        onBehaviorAnalysisRun?.(capture);
        uiMemory.behavior?.onCapture?.(capture);
      }
    } : undefined;

    runtimeRef.current = createAnyaRuntime({
      ...otherConfig,
      nodes: nodeDefs,
      workflows,
      appViews,
      viewTemplates,
      allowedCapabilities,
      storage,
      onPersistError: (error) => {
        getLogger().warn('[useAnyaRuntime] Failed to persist memory snapshot.', error);
      },
      runtime: {
        onEffectError: (error, event) => {
          getLogger().warn('[useAnyaRuntime] Runtime effect failure:', event.type, error);
        },
      },
      ...(uiMemory?.enabled ? { 
        uiMemory: { 
          ...uiMemory,
          behavior: behaviorConfig
        } 
      } : {}),
    });
  }

  const runtime = runtimeRef.current;

  const applyThemeUpdate = useCallback(async (update: Record<string, string>) => {
    const merged = await saveThemeTokens(runtime.storage, update);
    injectCSSVars?.(merged);
  }, [injectCSSVars, runtime.storage]);

  // Behavior findings subscription
  useEffect(() => {
    // Note: setOnCapture is wired in kernel.ts to update sessionMemory and viewEngine.
    // This prop allows the host app to also receive the capture.
    if (uiMemory?.behavior && onBehaviorAnalysisRun) {
      // The kernel already has a listener that calls config.uiMemory.behavior.onCapture
      // But since we are creating the runtime here, we should ensure the config passed to createAnyaRuntime
      // includes this callback if it changes.
      // However, kernel.ts wires it at creation time.
      // To support dynamic updates, we might need a way to update the kernel's listener.
      // For now, we assume these are stable or we rely on the kernel's internal wiring.
    }
  }, [uiMemory, onBehaviorAnalysisRun]);

  // Runtime effects wiring
  useEffect(() => {
    const effects: RuntimeEffect[] = createDefaultRuntimeEffects({
      memory: runtime.sessionMemory,
      profile: runtime.userProfile,
      viewEngine: runtime.viewEngine,
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

    runtime.runtime.replaceEffects(effects);
  }, [
    applyThemeUpdate,
    failureBudgetPolicy,
    runtime.runtime,
    runtime.sessionMemory,
    runtime.userProfile,
    runtime.viewEngine,
    onFailureBudgetSignal,
    onRuntimeEvent,
    onTelemetryEvent,
    telemetryIncludePayload,
  ]);

  // Workflow context synchronization
  useEffect(() => {
    const unsubscribe = runtime.workflowRegistry.onChange(() => {
      const workflowsList = runtime.workflowRegistry.list();
      runtime.viewEngine.setContext({
        availableWorkflows: workflowsList,
      });
    });
    return unsubscribe;
  }, [runtime.viewEngine, runtime.workflowRegistry]);

  // Initial hydration
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { themeTokens } = await runtime.hydrate();
      if (cancelled) return;

      injectCSSVars?.(themeTokens);

      const ctx = runtime.sessionMemory.getContext();
      runtime.runtime.dispatch(createRuntimeEvent('memory.hydrated', {
        state: {
          session: {
            userIntent: ctx.userIntent || undefined,
            workflowContext: ctx.workflowContext,
          },
          ui: {
            spec: runtime.sessionMemory.getCurrentSpec(),
            schemaVersion: 1,
          },
          memory: {
            interactions: [...runtime.sessionMemory.getInteractions()],
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
  }, [injectCSSVars, runtime]);

  return runtime;
}
