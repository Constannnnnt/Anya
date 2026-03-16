/**
 * Presentation Engine state machine.
 *
 * Responsibilities:
 * - hold presentation context/current UI tree
 * - generate/apply presentation plans
 * - execute interaction bindings with optimistic + rollback semantics
 *
 * Invariants:
 * - interactions execute serially
 * - `currentSpec` + `bindings` represent the live rendered state
 * - plan confidence is normalized to [0, 1]
 */
import type { UIInteractionRecord, UIRenderSpec } from '../types';
import { cloneRenderSpec } from '../clone';
import { getLogger } from '../logging';
import {
  CURRENT_PRESENTATION_PLAN_VERSION,
  type BindingAction,
  type PresentationPlannerStrategyName,
  type PresentationPlanningPolicy,
  type BindingExecutionRecord,
  type PresentationContext,
  type PresentationPlan,
  type PresentationPlanApplicationResult,
  type PresentationPlanRequest,
  type PresentationState,
  type ToolCallPolicy,
  type ToolExecutionLane,
  type ToolManifest,
  type ToolRiskLevel,
  type DataNode,
} from './types';
import { planUIUpdate } from './updatePlanner';
import { applyLocalUIUpdates, applyPresentationPlan, setComponentProp } from './uiUpdater';
import {
  BindingActionExecutor,
  type BindingActionHandler,
  resolveBindingValue,
  getByPath,
  setDeepValue,
  ToolRuntime,
  type ToolHandler,
} from './tools';
import { createReactiveDataStore } from './reactiveStore';

export interface PresentationEngine {
  /** Returns the current in-memory presentation state snapshot. */
  getState(): PresentationState;
  /** Subscribes to state changes; returns an unsubscribe callback. */
  subscribe(listener: () => void): () => void;
  /** Merges context values without discarding existing arrays unless explicitly provided. */
  setContext(patch: Partial<PresentationContext>): void;
  /** Plans the next UI update from context/candidate inputs. */
  plan(request?: PresentationPlanRequest): PresentationPlan;
  /** Applies a plan to produce the next currentSpec + bindings. */
  applyPlan(plan: PresentationPlan): PresentationPlanApplicationResult;
  /** Alias of applyPlan for call sites that use save semantics. */
  savePlan(plan: PresentationPlan): PresentationPlanApplicationResult;
  /** Registers a tool (and optional handler) into runtime + presentation context. */
  registerTool(tool: ToolManifest, handler?: ToolHandler): () => void;
  /** Registers/overrides one tool handler by tool id. */
  registerToolHandler(toolId: string, handler: ToolHandler): () => void;
  /** Registers/overrides one binding action strategy handler. */
  registerBindingActionHandler<TType extends BindingAction['type']>(
    type: TType,
    handler: BindingActionHandler<Extract<BindingAction, { type: TType }>>
  ): () => void;
  /** Executes matching bindings for one interaction and commits resulting UI updates. */
  executeInteraction(interaction: UIInteractionRecord): Promise<BindingExecutionRecord[]>;
  /** Registers a reactive effect that runs when data nodes change. */
  registerEffect(id: string, effect: (dataNodes: DataNode[]) => void): () => void;
}

function normalizePlan(plan: PresentationPlan): PresentationPlan {
  return {
    ...plan,
    plan_version: plan.plan_version ?? CURRENT_PRESENTATION_PLAN_VERSION,
    confidence: Number.isFinite(plan.confidence) ? Math.max(0, Math.min(1, plan.confidence)) : 0.5,
    bindings: plan.bindings ?? [],
  };
}

function mergeContext(
  base: PresentationContext,
  patch: Partial<PresentationContext>,
  proxyDataNodes: DataNode[],
): PresentationContext {
  return {
    ...base,
    ...patch,
    // CRITICAL: always use the reactive proxy as the canonical dataNodes reference.
    // If patch.dataNodes was provided, the caller must have already synced them
    // into the dataStore before calling mergeContext.
    dataNodes: proxyDataNodes,
    tools: patch.tools ?? base.tools,
    availableWorkflowContexts: patch.availableWorkflowContexts ?? base.availableWorkflowContexts,
    candidateBindings: patch.candidateBindings ?? base.candidateBindings,
    currentBindings: patch.currentBindings ?? base.currentBindings,
    projectionComponents: patch.projectionComponents ?? base.projectionComponents,
    sessionHistory: patch.sessionHistory ?? base.sessionHistory,
  };
}

function resolveToolCallPolicy(
  action: Extract<BindingAction, { type: 'tool_call' }>,
  tool: ToolManifest | undefined
): Required<ToolCallPolicy> {
  const inferredLane: ToolExecutionLane =
    tool?.execution?.mode === 'client'
      ? 'optimistic'
      : 'confirmed';
  const inferredRisk: ToolRiskLevel =
    tool?.execution?.mode === 'client'
      ? 'safe'
      : 'risky';

  return {
    lane: action.policy?.lane ?? inferredLane,
    risk: action.policy?.risk ?? inferredRisk,
    rollbackMessage: action.policy?.rollbackMessage ?? 'Action failed. Reverted optimistic UI state.',
  };
}

export function createPresentationEngine(opts?: {
  initialContext?: Partial<PresentationContext>;
  allowedToolIds?: string[];
  maxExecutionHistory?: number;
  plannerStrategy?: PresentationPlannerStrategyName;
  planningPolicy?: PresentationPlanningPolicy;
  actionExecutor?: BindingActionExecutor;
}): PresentationEngine {
  // Engine instances are host-scoped. State is fully in-memory and synchronous.
  const maxExecutionHistory = opts?.maxExecutionHistory ?? 200;
  const runtime = new ToolRuntime({
    allowedToolIds: opts?.allowedToolIds,
  });
  const actionExecutor = opts?.actionExecutor ?? new BindingActionExecutor();
  const dataStore = createReactiveDataStore(opts?.initialContext?.dataNodes ?? []);
  const listeners = new Set<() => void>();
  const staleInteractionError = 'State changed while interaction was running; skipped stale interaction result.';
  let stateRevision = 0;
  let interactionQueue: Promise<void> = Promise.resolve();
  const effects = new Map<string, (dataNodes: DataNode[]) => void>();

  const runEffects = () => {
    for (const effect of Array.from(effects.values())) {
      try {
        effect(dataStore.state.dataNodes);
      } catch (error) {
        getLogger().warn('[PresentationEngine] Effect failed.', error);
      }
    }
  };

  let state: PresentationState = {
    context: {
      context_version: 0,
      dataNodes: dataStore.state.dataNodes, // Use the proxy
      tools: opts?.initialContext?.tools ?? [],
      workflowContext: opts?.initialContext?.workflowContext,
      availableWorkflowContexts: opts?.initialContext?.availableWorkflowContexts ?? [],
      candidateSpec: opts?.initialContext?.candidateSpec ?? null,
      candidateBindings: opts?.initialContext?.candidateBindings ?? [],
      currentSpec: opts?.initialContext?.currentSpec ?? null,
      currentBindings: opts?.initialContext?.currentBindings ?? [],
      requestedMode: opts?.initialContext?.requestedMode,
      plannerStrategy: opts?.initialContext?.plannerStrategy ?? opts?.plannerStrategy,
      planningPolicy: opts?.initialContext?.planningPolicy ?? opts?.planningPolicy,
      newUserContext: opts?.initialContext?.newUserContext,
      projectionComponents: opts?.initialContext?.projectionComponents,
      sessionHistory: opts?.initialContext?.sessionHistory ?? [],
      persistentProfile: opts?.initialContext?.persistentProfile,
    },
    currentSpec: opts?.initialContext?.currentSpec ?? null,
    bindings: opts?.initialContext?.currentBindings ?? [],
    lastPlan: null,
    executionHistory: [],
  };

  // Sync state.context.dataNodes with dataStore proxy
  dataStore.subscribe(() => {
    runEffects(); // Run calculations before notifying listeners
    state = {
      ...state,
      context: {
        ...state.context,
        dataNodes: dataStore.state.dataNodes,
      },
    };
    notify();
  });

  // Register data_update handler
  actionExecutor.registerHandler('data_update', async ({ action, spec, input }) => {
    const resolvedValue = resolveBindingValue(action.value, input);
    
    // Mutate the proxy! Valtio handles the rest.
    let node = dataStore.state.dataNodes.find((n: DataNode) => n.id === action.nodeId);
    if (!node) {
      // Auto-create missing data nodes so bindings don't silently fail
      node = { id: action.nodeId, kind: 'record', payload: {} } as DataNode;
      dataStore.state.dataNodes.push(node);
    }
    if (action.path) {
      setDeepValue(node.payload, action.path, resolvedValue);
    } else {
      node.payload = resolvedValue;
    }

    return {
      record: {
        bindingId: '', // Filled by executor
        status: 'success',
        timestamp: Date.now(),
        interaction: input.interaction,
      },
      updatedSpec: spec, // Return current spec; state mutation is via proxy
    };
  });

  runtime.registerTools(state.context.tools);

  // Register register_calculation tool
  const registerCalculationTool: ToolManifest = {
    id: 'register_calculation',
    name: 'Register Calculation',
    description: 'Registers a reactive calculation that updates a data node when dependencies change.',
    execution: { mode: 'client' },
  };
  
  runtime.registerTool(registerCalculationTool);
  runtime.registerHandler('register_calculation', ({ args }) => {
    const { targetNodeId, targetPath, formula, dependencies } = args as any;
    
    return (dataNodes: DataNode[]) => {
      try {
        const nodeValues: Record<string, any> = {};
        dependencies.forEach((dep: any, idx: number) => {
          const node = dataNodes.find(n => n.id === dep.nodeId);
          if (node) {
            const val = dep.path ? getByPath(node.payload, dep.path) : node.payload;
            nodeValues[`$${idx}`] = val ?? 0;
            if (dep.alias) nodeValues[dep.alias] = val ?? 0;
          }
        });

        // Simple evaluator for basic math: +, -, *, /, ^, Math.pow, etc.
        const keys = Object.keys(nodeValues);
        const values = Object.values(nodeValues);
        const evaluator = new Function(...keys, `return ${formula}`);
        const result = evaluator(...values);

        const targetNode = dataNodes.find(n => n.id === targetNodeId);
        if (targetNode) {
          if (targetPath) {
            setDeepValue(targetNode.payload, targetPath, result);
          } else {
            targetNode.payload = result;
          }
        }
      } catch (error) {
        getLogger().warn(`[CalculationEffect] Failed to evaluate formula "${formula}":`, error);
      }
    };
  });

  // Override runtime.executeToolCall to handle register_calculation special case
  const originalExecute = runtime.executeToolCall.bind(runtime);
  runtime.executeToolCall = async (action, input) => {
    if (action.toolId === 'register_calculation') {
      const handler = runtime.getHandler?.('register_calculation');
      if (handler) {
        const effect = (handler as any)({ tool: registerCalculationTool, args: action.args, interaction: input.interaction });
        if (typeof effect === 'function') {
          const id = (action.args as any)?.id || `calc-${Date.now()}`;
          effects.set(id, effect);
          effect(dataStore.state.dataNodes); // Initial run
        }
      }
      return {
        toolId: 'register_calculation',
        args: action.args as any,
        result: { status: 'registered' },
        resultPatches: [],
      };
    }
    return originalExecute(action, input);
  };

  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        getLogger().warn('[PresentationEngine] Subscriber failed.', error);
      }
    }
  };

  const transact = <T>(update: (current: PresentationState) => {
    nextState: PresentationState;
    result: T;
  }): T => {
    const previousState = state;
    const previousRevision = stateRevision;

    try {
      const { nextState, result } = update(state);
      state = nextState;
      stateRevision += 1;
      notify();
      return result;
    } catch (error) {
      state = previousState;
      stateRevision = previousRevision;
      throw error;
    }
  };

  const enqueueInteraction = <T>(task: () => Promise<T>): Promise<T> => {
    const next = interactionQueue.then(task, task);
    interactionQueue = next.then(
      () => undefined,
      () => undefined
    );
    return next;
  };

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setContext(patch) {
      const normalizedPatch = patch;
      const previousTools = state.context.tools;
      if (normalizedPatch.tools) {
        runtime.setTools(normalizedPatch.tools);
      }

      // CRITICAL: sync incoming dataNodes into the reactive Valtio store
      // so that data_update mutations and $data reads all operate on the
      // same proxy reference. Without this, setContext creates a detached
      // copy and all subsequent mutations are invisible to the renderer.
      if (normalizedPatch.dataNodes) {
        dataStore.setNodes(normalizedPatch.dataNodes);
      }

      try {
        transact((current) => ({
          nextState: {
            ...current,
            context: mergeContext(current.context, normalizedPatch, dataStore.state.dataNodes),
            currentSpec:
              normalizedPatch.currentSpec === undefined
                ? current.currentSpec
                : normalizedPatch.currentSpec ?? null,
            bindings: normalizedPatch.currentBindings ?? current.bindings,
          },
          result: undefined,
        }));
      } catch (error) {
        if (normalizedPatch.tools) {
          runtime.setTools(previousTools);
        }
        throw error;
      }
    },

    plan(request) {
      return transact((current) => {
        const context: PresentationContext = {
          ...current.context,
          currentSpec: current.currentSpec,
          currentBindings: current.bindings,
          newUserContext: request?.newUserContext ?? current.context.newUserContext,
          workflowContext: request?.workflowContext ?? current.context.workflowContext,
          requestedMode: request?.requestedMode ?? current.context.requestedMode,
          plannerStrategy: request?.plannerStrategy ?? current.context.plannerStrategy,
          planningPolicy: request?.planningPolicy ?? current.context.planningPolicy,
          projectionComponents: request?.projectionComponents ?? current.context.projectionComponents,
          candidateSpec: request?.candidateSpec === undefined
            ? current.context.candidateSpec
            : request.candidateSpec,
          candidateBindings: request?.candidateBindings ?? current.context.candidateBindings,
        };
        const plan = normalizePlan(planUIUpdate(context));
        return {
          nextState: {
            ...current,
            context,
            lastPlan: plan,
          },
          result: plan,
        };
      });
    },

    applyPlan(plan) {
      return transact((current) => {
        const normalized = normalizePlan(plan);
        const applied = applyPresentationPlan(current.currentSpec, current.bindings, normalized);
        return {
          nextState: {
            ...current,
            currentSpec: applied.spec,
            bindings: applied.bindings,
            lastPlan: normalized,
            context: {
              ...current.context,
              candidateSpec: applied.spec,
              candidateBindings: applied.bindings,
              currentSpec: applied.spec,
              currentBindings: applied.bindings,
            },
          },
          result: applied,
        };
      });
    },

    savePlan(plan) {
      return this.applyPlan(plan);
    },

    registerTool(tool, handler) {
      if (!handler) {
        runtime.clearHandler(tool.id);
      }
      runtime.registerTool(tool);
      transact((current) => ({
        nextState: {
          ...current,
          context: {
            ...current.context,
            tools: [...current.context.tools.filter((existing) => existing.id !== tool.id), tool],
          },
        },
        result: undefined,
      }));

      const unregisterHandler = handler
        ? runtime.registerHandler(tool.id, handler)
        : () => {};

      return () => {
        unregisterHandler();
        if (!state.context.tools.some((existing) => existing.id === tool.id && existing === tool)) {
          return;
        }

        runtime.unregisterToolIfCurrent(tool.id, tool);
        transact((current) => ({
          nextState: {
            ...current,
            context: {
              ...current.context,
              tools: current.context.tools.filter((existing) => existing !== tool),
            },
          },
          result: undefined,
        }));
      };
    },

    registerToolHandler(toolId, handler) {
      return runtime.registerHandler(toolId, handler);
    },

    registerBindingActionHandler(type, handler) {
      return actionExecutor.registerHandler(type, handler);
    },

    async executeInteraction(interaction) {
      return enqueueInteraction(async () => {
        const startState = state;
        const startRevision = stateRevision;

        if (!startState.currentSpec) return [];

        // 1) Resolve bindings that match this event.
        const matchingBindings = startState.bindings.filter((binding) => {
          if (binding.componentId !== interaction.elementId) return false;
          if (binding.trigger && interaction.trigger && binding.trigger !== interaction.trigger) {
            return false;
          }
          if (binding.actionMatch && binding.actionMatch !== interaction.action) return false;
          return true;
        });

        if (matchingBindings.length === 0) return [];

        const records: BindingExecutionRecord[] = [];
        let workingSpec: UIRenderSpec = startState.currentSpec;
        let expectedRevision = startRevision;
        const commitPreview = (spec: UIRenderSpec) => {
          transact((current) => ({
            nextState: {
              ...current,
              currentSpec: spec,
              context: {
                ...current.context,
                currentSpec: spec,
              },
            },
            result: undefined,
          }));
          expectedRevision = stateRevision;
        };

        for (const binding of matchingBindings) {
          let preBindingSpec: UIRenderSpec | undefined;
          const action = binding.action;
          let optimisticApplied = false;
          let resolvedLane: ToolExecutionLane | undefined;
          let resolvedRisk: ToolRiskLevel | undefined;
          let rollbackMessage: string | undefined;

          // 2) Apply lane/risk policy and optional optimistic preview updates.
          if (action.type === 'tool_call') {
            const tool = startState.context.tools.find((candidate) => candidate.id === action.toolId);
            const policy = resolveToolCallPolicy(action, tool);
            resolvedLane = policy.lane;
            resolvedRisk = policy.risk;
            rollbackMessage = policy.rollbackMessage;

            if (
              policy.lane === 'optimistic'
              && action.optimisticPatches
              && action.optimisticPatches.length > 0
            ) {
              preBindingSpec = cloneRenderSpec(workingSpec);
              const optimistic = applyLocalUIUpdates(
                workingSpec,
                action.optimisticPatches,
                (value) => resolveBindingValue(value, {
                  interaction,
                  dataNodes: startState.context.dataNodes,
                })
              );
              workingSpec = optimistic.updatedSpec;
              optimisticApplied = optimistic.applied > 0;
              if (optimisticApplied) {
                commitPreview(workingSpec);
              }
            }

            if (policy.risk === 'risky') {
              if (!preBindingSpec) preBindingSpec = cloneRenderSpec(workingSpec);
              workingSpec = setComponentProp(workingSpec, binding.componentId, 'busy', true);
              commitPreview(workingSpec);
            }
          }

          // 3) Execute the action through the binding handler registry.
          const outcome = await actionExecutor.execute({
            action,
            spec: workingSpec,
            binding,
            runtime,
            input: {
              interaction,
              dataNodes: startState.context.dataNodes,
            },
          });

          let nextSpec = outcome.updatedSpec;
          let nextRecord: BindingExecutionRecord = outcome.record;

          if (resolvedRisk === 'risky') {
            nextSpec = setComponentProp(nextSpec, binding.componentId, 'busy', false);
          }

          if (optimisticApplied && outcome.record.status === 'error') {
            nextSpec = preBindingSpec || workingSpec;
            nextRecord = {
              ...nextRecord,
              rolledBack: true,
              error: rollbackMessage,
            };
          }

          nextRecord = {
            ...nextRecord,
            lane: resolvedLane,
            risk: resolvedRisk,
          };

          workingSpec = nextSpec;
          records.push(nextRecord);
        }

        // 4) Commit results unless another update already moved state forward.
        return transact((current) => {
          const stale = stateRevision !== expectedRevision;
          const committedRecords: BindingExecutionRecord[] = stale
            ? records.map((record): BindingExecutionRecord => ({
                ...record,
                status: record.status === 'error' ? 'error' : 'skipped',
                error: record.status === 'error' ? record.error : staleInteractionError,
              }))
            : records;

          const executionHistory = [...current.executionHistory, ...committedRecords].slice(-maxExecutionHistory);
          const nextSessionHistory = [...(current.context.sessionHistory ?? []), interaction].slice(-400);

          if (stale) {
            return {
              nextState: {
                ...current,
                executionHistory,
                context: {
                  ...current.context,
                  sessionHistory: nextSessionHistory,
                },
              },
              result: committedRecords,
            };
          }

          return {
            nextState: {
              ...current,
              currentSpec: workingSpec,
              executionHistory,
              context: {
                ...current.context,
                currentSpec: workingSpec,
                sessionHistory: nextSessionHistory,
              },
            },
            result: committedRecords,
          };
        });
      });
    },

    registerEffect(id, effect) {
      effects.set(id, effect);
      // Trigger once immediately
      try {
        effect(dataStore.state.dataNodes);
      } catch (error) {
        getLogger().warn(`[PresentationEngine] Initial effect '${id}' failed.`, error);
      }
      return () => {
        effects.delete(id);
      };
    },
  };
}
