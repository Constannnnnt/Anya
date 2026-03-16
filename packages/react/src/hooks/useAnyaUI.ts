/**
 * @anya-ui/react — useAnyaUI Hook
 *
 * Primary hook for session-oriented UI generation.
 * Provides prompt helpers, typed session startup, and runtime/presentation control.
 *
 * Hosts can either start a typed agent session or manually decode
 * `anya.ui_spec` surface payloads when needed.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import { useAnyaContext, type AnyaContextValue } from '../Provider';
import type {
  AgentMessage,
  AgentSessionRun,
  AgentSessionTransport,
  AgentState,
  BindingAction,
  BindingActionHandler,
  BindingExecutionRecord,
  DataNode,
  IntentUpdateMode,
  PresentationContext,
  PresentationPlan,
  PresentationPlannerStrategyName,
  PresentationPlanningPolicy,
  PresentationPlanApplicationResult,
  PresentationState,
  PromptOptions,
  PromptParts,
  RuntimeEvent,
  RuntimeEventListener,
  RuntimeEventPattern,
  RuntimeState,
  ToolHandler,
  ToolManifest,
  UIBinding,
  UIInteractionMeasurementHint,
  UIRenderSpec,
  UIInteractionRecord,
} from '@anya-ui/core';
import {
  decode as coreDecode,
  encode as coreEncode,
  createRuntimeEvent,
  getLogger,
  extractBindingsFromSpec as coreExtractBindingsFromSpec,
} from '@anya-ui/core';
import type { AnyaComponent } from '../defineComponent';
import {
  buildPresentedSurface,
  DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
  deriveInteractionMeasurement,
  sanitizeInteractionRecordForTelemetry,
} from '../behavior/telemetry';
import {
  createInteractionMeasurementTracker,
  type InteractionMeasurementTracker,
} from '../behavior/interactionTracker';

// ─── Return Type ─────────────────────────────────────────────────────────

export interface UseAnyaUI {
  /** Build the system prompt */
  buildSystemPrompt: (opts?: PromptOptions) => string;
  /** Build the lightweight Round 1 selection prompt for progressive disclosure */
  buildSelectionPrompt: (userMessage: string) => string;
  getPromptParts: () => PromptParts;
  /** Decode LLM YAML → UIRenderSpec */
  decode: (raw: string) => UIRenderSpec;
  /** Encode a UI interaction into semantic text */
  encodeInteraction: (interaction: UIInteractionRecord) => string;
  /** Publish decoded spec into the runtime/state pipeline */
  publishSpec: (spec: UIRenderSpec) => void;
  /** Record a user interaction through runtime dispatch */
  recordInteraction: (
    interaction: UIInteractionRecord,
    measurementHint?: UIInteractionMeasurementHint,
  ) => void;
  /** Update active intent through runtime dispatch */
  setUserIntent: (intent: string, mode?: IntentUpdateMode) => void;
  /** Update agent status through runtime dispatch */
  setAgentStatus: (status: AgentState) => void;
  /** Low-level runtime event dispatch */
  dispatchRuntimeEvent: (event: RuntimeEvent) => RuntimeState;
  /** Subscribe to typed runtime event channels */
  subscribeRuntimeEvents: (
    pattern: RuntimeEventPattern,
    listener: RuntimeEventListener,
  ) => () => void;
  /** Current presentation state (data/tools/bindings/plan/execution history) */
  presentationState: PresentationState;
  /** Update presentation context directly */
  setPresentationContext: (patch: Partial<PresentationContext>) => void;
  /** Convenience data context update */
  setPresentationData: (dataNodes: DataNode[]) => void;
  /** Convenience tool context update */
  setPresentationTools: (tools: ToolManifest[]) => void;
  /** Set agent candidate spec/bindings for planning */
  setPresentationCandidate: (input: { spec: UIRenderSpec | null; bindings?: UIBinding[] }) => void;
  /** Set workflow context for workflow-aware planning/projection */
  setWorkflowContext: (workflowName?: string) => void;
  /** Build a patch-first v0 presentation plan from current context */
  planPresentation: (input?: {
    newUserContext?: string;
    workflowContext?: string;
    requestedMode?: 'patch' | 'rebuild';
    plannerStrategy?: PresentationPlannerStrategyName;
    planningPolicy?: PresentationPlanningPolicy;
    candidateSpec?: UIRenderSpec | null;
    candidateBindings?: UIBinding[];
  }) => PresentationPlan;
  /** Apply a presentation plan and sync runtime UI spec */
  commitPresentationPlan: (plan: PresentationPlan) => PresentationPlanApplicationResult;
  /** Extract interactions from an LLM-provided UIRenderSpec into a PresentationPlan */
  extractBindingsFromSpec: (spec: UIRenderSpec) => PresentationPlan;
  /** Register tool + optional handler for native runtime execution */
  registerTool: (tool: ToolManifest, handler?: ToolHandler) => () => void;
  /** Register/override tool handler */
  registerToolHandler: (toolId: string, handler: ToolHandler) => () => void;
  /** Register/override a binding action handler strategy */
  registerBindingActionHandler: <TType extends BindingAction['type']>(
    type: TType,
    handler: BindingActionHandler<Extract<BindingAction, { type: TType }>>
  ) => () => void;
  /** Execute bindings for an interaction without runtime event dispatch */
  executePresentationInteraction: (interaction: UIInteractionRecord) => Promise<BindingExecutionRecord[]>;
  /** Record runtime interaction and execute matching bindings */
  handleUserInteraction: (
    interaction: UIInteractionRecord,
    measurementHint?: UIInteractionMeasurementHint,
  ) => Promise<BindingExecutionRecord[]>;
  /** Current active bindings */
  getBindings: () => UIBinding[];
  /** Start an artifact-oriented agent session stream */
  startAgentSession: (input: {
    sessionId?: string;
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    transport?: AgentSessionTransport;
  }) => Promise<AgentSessionRun>;
  /** Subscribe-ready runtime state snapshot */
  runtimeState: RuntimeState;
  /** Get the anya.md adaptive profile content */
  getProfile: () => string;
  /** Register a component at runtime */
  registerComponent: (component: AnyaComponent) => () => void;
  /** Unregister a component by name */
  unregisterComponent: (name: string) => void;
  /** Raw context */
  context: AnyaContextValue;
}

interface PlannedToolCall {
  toolId: string;
  bindingId: string;
}

function createToolCallKey(bindingId: string, toolId: string): string {
  return `${bindingId}::${toolId}`;
}

function getCurrentSpec(ctx: AnyaContextValue): UIRenderSpec | null {
  return ctx.presentation.getState().currentSpec ?? ctx.memory.getCurrentSpec();
}

function prepareInteractionTelemetry(
  ctx: AnyaContextValue,
  interaction: UIInteractionRecord,
  tracker: InteractionMeasurementTracker,
  measurementHint?: UIInteractionMeasurementHint,
): {
  measurement: ReturnType<typeof deriveInteractionMeasurement>;
  persistedInteraction: UIInteractionRecord;
} {
  const baseMeasurement = deriveInteractionMeasurement(
    interaction,
    getCurrentSpec(ctx),
    measurementHint,
    DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
  );
  const measurement = tracker.enrich(interaction, baseMeasurement, measurementHint);

  return {
    measurement,
    persistedInteraction: sanitizeInteractionRecordForTelemetry(
      interaction,
      measurement,
      DEFAULT_BEHAVIOR_TELEMETRY_POLICY,
    ),
  };
}

function doesBindingMatchInteraction(
  binding: UIBinding,
  interaction: UIInteractionRecord,
): boolean {
  if (binding.componentId !== interaction.elementId) return false;
  if (binding.trigger && interaction.trigger && binding.trigger !== interaction.trigger) {
    return false;
  }
  if (binding.actionMatch && binding.actionMatch !== interaction.action) return false;
  return true;
}

function collectToolCallsFromAction(
  action: BindingAction,
  bindingId: string,
  out: PlannedToolCall[],
): void {
  if (action.type === 'tool_call') {
    out.push({
      toolId: action.toolId,
      bindingId,
    });
    return;
  }
  if (action.type === 'composite') {
    for (const nested of action.actions) {
      collectToolCallsFromAction(nested, bindingId, out);
    }
  }
}

function collectPlannedToolCalls(
  bindings: UIBinding[],
  interaction: UIInteractionRecord,
): PlannedToolCall[] {
  const planned: PlannedToolCall[] = [];
  for (const binding of bindings) {
    if (!doesBindingMatchInteraction(binding, interaction)) continue;
    collectToolCallsFromAction(binding.action, binding.id, planned);
  }

  const seen = new Set<string>();
  const deduped: PlannedToolCall[] = [];
  for (const item of planned) {
    const key = createToolCallKey(item.bindingId, item.toolId);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

// ─── Hook ────────────────────────────────────────────────────────────────

/**
 * Main React integration hook.
 * Returns a stable facade for runtime orchestration, presentation planning,
 * bindings execution, and component/tool registration.
 */
export function useAnyaUI(): UseAnyaUI {
  const ctx = useAnyaContext();
  const measurementTrackerRef = useRef(createInteractionMeasurementTracker());
  const runtimeState = useSyncExternalStore(
    ctx.runtime.subscribe,
    ctx.runtime.getState,
    ctx.runtime.getState,
  );
  const presentationState = useSyncExternalStore(
    ctx.presentation.subscribe,
    ctx.presentation.getState,
    ctx.presentation.getState,
  );

  const dispatchRuntimeEvent = useCallback(
    (event: RuntimeEvent) => ctx.runtime.dispatch(event),
    [ctx.runtime]
  );

  const reportDecodeFailure = useCallback(
    (error: unknown, defaultMessage: string) => {
      dispatchRuntimeEvent(createRuntimeEvent('spec.decode_failed', {
        error: error instanceof Error ? error.message : defaultMessage,
      }, { source: 'agent' }));
    },
    [dispatchRuntimeEvent]
  );

  const runPluginHook = useCallback((
    plugin: AnyaComponent | undefined,
    hook: 'onRegister' | 'onUnregister',
    label: string
  ) => {
    if (!plugin) return;
    const fn = plugin[hook];
    if (!fn) return;
    try {
      fn();
    } catch (error) {
      getLogger().warn(`[useAnyaUI.${label}] ${hook} hook failed for '${plugin.name}'.`, error);
    }
  }, []);

  const removeComponentRegistration = useCallback((name: string) => {
    const plugin = ctx.pluginMap.get(name);
    runPluginHook(plugin, 'onUnregister', 'unregister');
    ctx.catalog.unregister(name);
    ctx.componentMap.delete(name);
    ctx.pluginMap.delete(name);
  }, [ctx.catalog, ctx.componentMap, ctx.pluginMap, runPluginHook]);

  const buildSystemPrompt = useCallback(
    (opts?: PromptOptions) => {
      const mergedOpts: PromptOptions = {
        ...opts,
        includeMemory: opts?.includeMemory ?? true,
      };
      return ctx.orchestrator.buildSystemPrompt(mergedOpts);
    },
    [ctx.orchestrator]
  );

  const getPromptParts = useCallback(
    () => ctx.orchestrator.getPromptParts(),
    [ctx.orchestrator]
  );

  const buildSelectionPrompt = useCallback(
    (userMessage: string) => ctx.orchestrator.buildSelectionPrompt(userMessage),
    [ctx.orchestrator]
  );

  const setPresentationContext = useCallback(
    (patch: Partial<PresentationContext>) => {
      ctx.presentation.setContext(patch);
    },
    [ctx.presentation]
  );

  const setPresentationData = useCallback(
    (dataNodes: DataNode[]) => setPresentationContext({ dataNodes }),
    [setPresentationContext]
  );

  const setPresentationTools = useCallback(
    (tools: ToolManifest[]) => setPresentationContext({ tools }),
    [setPresentationContext]
  );

  const setPresentationCandidate = useCallback(
    (input: { spec: UIRenderSpec | null; bindings?: UIBinding[] }) =>
      setPresentationContext({
        candidateSpec: input.spec,
        candidateBindings: input.bindings ?? [],
      }),
    [setPresentationContext]
  );

  const setWorkflowContext = useCallback(
    (workflowName?: string) => setPresentationContext({ workflowContext: workflowName }),
    [setPresentationContext]
  );

  const decode = useCallback(
    (raw: string) => {
      try {
        return coreDecode(raw, ctx.catalog);
      } catch (error) {
        reportDecodeFailure(error, 'Unknown decode error');
        throw error;
      }
    },
    [ctx.catalog, reportDecodeFailure]
  );

  const encodeInteraction = useCallback(
    (interaction: UIInteractionRecord) => coreEncode(interaction, ctx.memory),
    [ctx.memory]
  );

  const registerComponent = useCallback(
    (component: AnyaComponent) => {
      const previousPlugin = ctx.pluginMap.get(component.name);

      ctx.catalog.register({
        name: component.name,
        description: component.description,
        propsSchema: component.propsSchema,
        examples: component.examples,
        tags: component.tags,
        capabilities: component.capabilities,
      });

      if (previousPlugin && previousPlugin !== component) {
        runPluginHook(previousPlugin, 'onUnregister', 'register');
      }

      ctx.componentMap.set(component.name, component.render);
      ctx.pluginMap.set(component.name, component);
      runPluginHook(component, 'onRegister', 'register');

      return () => removeComponentRegistration(component.name);
    },
    [ctx.catalog, ctx.componentMap, ctx.pluginMap, removeComponentRegistration, runPluginHook]
  );

  const unregisterComponent = useCallback(
    (name: string) => removeComponentRegistration(name),
    [removeComponentRegistration]
  );

  const publishSpec = useCallback(
    (spec: UIRenderSpec, source: 'agent' | 'system' = 'agent') => {
      const specEvent = createRuntimeEvent('spec.decoded', { spec }, { source });
      dispatchRuntimeEvent(specEvent);
      dispatchRuntimeEvent(createRuntimeEvent('ui.presented', {
        surface: buildPresentedSurface(spec),
      }, {
        source,
        causationId: specEvent.id,
      }));
      if (spec.theme_update && Object.keys(spec.theme_update).length > 0) {
        dispatchRuntimeEvent(createRuntimeEvent('theme.updated', {
          tokens: spec.theme_update,
        }, { source }));
      }
    },
    [dispatchRuntimeEvent]
  );

  const planPresentation = useCallback(
    (input?: {
      newUserContext?: string;
      workflowContext?: string;
      requestedMode?: 'patch' | 'rebuild';
      plannerStrategy?: PresentationPlannerStrategyName;
      planningPolicy?: PresentationPlanningPolicy;
      candidateSpec?: UIRenderSpec | null;
      candidateBindings?: UIBinding[];
    }) => ctx.presentation.plan(input),
    [ctx.presentation]
  );

  const commitPresentationPlan = useCallback(
    (plan: PresentationPlan) => {
      const result = ctx.presentation.applyPlan(plan);
      publishSpec(result.spec, 'system');
      return result;
    },
    [ctx.presentation, publishSpec]
  );

  const extractBindingsFromSpec = useCallback(
    (spec: UIRenderSpec) => coreExtractBindingsFromSpec(spec),
    []
  );

  const registerTool = useCallback(
    (tool: ToolManifest, handler?: ToolHandler) => ctx.presentation.registerTool(tool, handler),
    [ctx.presentation]
  );

  const registerToolHandler = useCallback(
    (toolId: string, handler: ToolHandler) =>
      ctx.presentation.registerToolHandler(toolId, handler),
    [ctx.presentation]
  );

  const registerBindingActionHandler = useCallback(
    <TType extends BindingAction['type']>(
      type: TType,
      handler: BindingActionHandler<Extract<BindingAction, { type: TType }>>
    ) => ctx.presentation.registerBindingActionHandler(type, handler),
    [ctx.presentation]
  );

  const executePresentationInteraction = useCallback(
    (interaction: UIInteractionRecord) => ctx.presentation.executeInteraction(interaction),
    [ctx.presentation]
  );

  const recordInteraction = useCallback(
    (
      interaction: UIInteractionRecord,
      measurementHint?: UIInteractionMeasurementHint,
    ) => {
      const {
        measurement,
        persistedInteraction,
      } = prepareInteractionTelemetry(
        ctx,
        interaction,
        measurementTrackerRef.current,
        measurementHint,
      );
      const interactionEvent = createRuntimeEvent('interaction.recorded', {
        record: persistedInteraction,
      }, { source: 'user' });
      dispatchRuntimeEvent(interactionEvent);
      dispatchRuntimeEvent(createRuntimeEvent('interaction.measured', {
        interactionEventId: interactionEvent.id,
        elementId: interaction.elementId,
        componentName: interaction.componentName,
        action: interaction.action,
        measurement,
      }, {
        source: 'user',
        causationId: interactionEvent.id,
      }));
    },
    [ctx.memory, ctx.presentation, dispatchRuntimeEvent]
  );

  const handleUserInteraction = useCallback(
    async (
      interaction: UIInteractionRecord,
      measurementHint?: UIInteractionMeasurementHint,
    ) => {
      const plannedToolCalls = collectPlannedToolCalls(
        ctx.presentation.getState().bindings,
        interaction,
      );
      const pendingToolCalls = new Map<string, PlannedToolCall>();
      for (const planned of plannedToolCalls) {
        pendingToolCalls.set(createToolCallKey(planned.bindingId, planned.toolId), planned);
      }
      const previousSpec = ctx.presentation.getState().currentSpec;
      recordInteraction(interaction, measurementHint);
      for (const planned of plannedToolCalls) {
        dispatchRuntimeEvent(createRuntimeEvent('tool.started', {
          toolId: planned.toolId,
          bindingId: planned.bindingId,
          interaction,
        }, { source: 'system' }));
      }
      const records = await ctx.presentation.executeInteraction(interaction);
      for (const record of records) {
        dispatchRuntimeEvent(createRuntimeEvent('binding.executed', {
          record,
        }, { source: 'system' }));
        if (!record.toolId) continue;
        pendingToolCalls.delete(createToolCallKey(record.bindingId, record.toolId));
        if (record.status === 'success') {
          dispatchRuntimeEvent(createRuntimeEvent('tool.finished', {
            toolId: record.toolId,
            bindingId: record.bindingId,
            interaction: record.interaction,
            durationMs: record.durationMs,
            result: record.result,
          }, { source: 'system' }));
          continue;
        }
        dispatchRuntimeEvent(createRuntimeEvent('tool.failed', {
          toolId: record.toolId,
          bindingId: record.bindingId,
          interaction: record.interaction,
          durationMs: record.durationMs,
          error: record.error ?? (
            record.status === 'skipped'
              ? 'Tool execution skipped before completion.'
              : 'Unknown tool execution error'
          ),
        }, { source: 'system' }));
      }
      for (const planned of pendingToolCalls.values()) {
        dispatchRuntimeEvent(createRuntimeEvent('tool.failed', {
          toolId: planned.toolId,
          bindingId: planned.bindingId,
          interaction,
          error: 'Tool execution was planned but no execution record was produced.',
        }, { source: 'system' }));
      }
      const nextSpec = ctx.presentation.getState().currentSpec;
      if (nextSpec && nextSpec !== previousSpec) {
        publishSpec(nextSpec, 'system');
      }
      return records;
    },
    [ctx.presentation, dispatchRuntimeEvent, publishSpec, recordInteraction]
  );

  const setUserIntent = useCallback(
    (intent: string, mode?: IntentUpdateMode) => {
      if (mode === 'replace') {
        measurementTrackerRef.current.reset();
      }
      dispatchRuntimeEvent(createRuntimeEvent('session.intent_updated', {
        userIntent: intent,
        mode,
      }, { source: 'user' }));
    },
    [dispatchRuntimeEvent]
  );

  const setAgentStatus = useCallback(
    (status: AgentState) => {
      dispatchRuntimeEvent(createRuntimeEvent('session.status_set', {
        status,
      }, { source: 'system' }));
    },
    [dispatchRuntimeEvent]
  );

  const subscribeRuntimeEvents = useCallback(
    (pattern: RuntimeEventPattern, listener: RuntimeEventListener) =>
      ctx.runtime.subscribeEvent(pattern, listener),
    [ctx.runtime]
  );

  const startAgentSession = useCallback((input: {
    sessionId?: string;
    userIntent: string;
    messages: AgentMessage[];
    promptOptions?: PromptOptions;
    transport?: AgentSessionTransport;
  }) => ctx.orchestrator.startAgentSession(input), [ctx.orchestrator]);

  const getProfile = useCallback(
    () => ctx.profile.getContent(),
    [ctx.profile]
  );

  const getBindings = useCallback(
    () => ctx.presentation.getState().bindings,
    [ctx.presentation]
  );

  return {
    buildSystemPrompt,
    buildSelectionPrompt,
    getPromptParts,
    presentationState,
    setPresentationContext,
    setPresentationData,
    setPresentationTools,
    setPresentationCandidate,
    setWorkflowContext,
    planPresentation,
    commitPresentationPlan,
    extractBindingsFromSpec,
    registerTool,
    registerToolHandler,
    registerBindingActionHandler,
    executePresentationInteraction,
    handleUserInteraction,
    getBindings,
    decode,
    encodeInteraction,
    publishSpec,
    recordInteraction,
    setUserIntent,
    setAgentStatus,
    dispatchRuntimeEvent,
    subscribeRuntimeEvents,
    startAgentSession,
    runtimeState,
    getProfile,
    registerComponent,
    unregisterComponent,
    context: ctx,
  };
}
