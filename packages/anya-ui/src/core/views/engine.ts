/**
 * View engine state machine.
 *
 * Responsibilities:
 * - hold view context/current UI tree
 * - generate/apply view plans
 * - execute action bindings with optimistic + rollback semantics
 *
 * Invariants:
 * - interactions execute serially
 * - `currentSpec` + `bindings` represent the live rendered state
 * - plan confidence is normalized to [0, 1]
 */
import type { ViewNode, UIInteractionRecord, ViewSpec } from '../types';
import { cloneRenderSpec, deepClone } from '../clone';
import { getLogger } from '../logging';
import type { StateGraph, StateMutationOptions } from '../state';
import { applyOptimisticUpdate } from '../utils';
import {
  CURRENT_VIEW_PLAN_VERSION,
  type ActionCommand,
  type ActionResult,
  type ApplyViewPlanResult,
  type StateNode,
  type ToolDefinition,
  type ToolLane,
  type ToolPolicy,
  type ToolRisk,
  type ViewContext,
  type ViewPlan,
  type ViewPlanRequest,
  type ViewPolicy,
  type ViewState,
  type ViewStrategyName,
} from './types';
import { planView } from './updatePlanner';
import { applyLocalViewChanges, applyViewPlan, setViewNodeProp } from './updater';
import {
  ActionCommandRunner,
  type ActionCommandHandler,
  resolveBindingValue,
  getByPath,
  setDeepValue,
  ToolRuntime,
  type ToolHandler,
} from './actions';
import { createReactiveStateStore } from './reactiveStore';

export interface ViewEngine {
  /** Returns the current in-memory view state snapshot. */
  getState(): ViewState;
  /** Shared state graph used by generated and managed views. */
  readonly stateGraph: StateGraph;
  /** Subscribes to state changes; returns an unsubscribe callback. */
  subscribe(listener: () => void): () => void;
  /** Merges context values without discarding existing arrays unless explicitly provided. */
  setContext(patch: Partial<ViewContext>): void;
  /** Plans the next view update from context/candidate inputs. */
  plan(request?: ViewPlanRequest): ViewPlan;
  /** Applies a plan to produce the next currentSpec + bindings. */
  applyPlan(plan: ViewPlan): ApplyViewPlanResult;
  /** Alias of applyPlan for call sites that use save semantics. */
  savePlan(plan: ViewPlan): ApplyViewPlanResult;
  /** Registers a tool (and optional handler) into runtime + view context. */
  registerTool(tool: ToolDefinition, handler?: ToolHandler): () => void;
  /** Registers/overrides one tool handler by tool id. */
  registerToolHandler(toolId: string, handler: ToolHandler): () => void;
  /** Registers/overrides one action strategy handler. */
  registerBindingActionHandler<TType extends ActionCommand['type']>(
    type: TType,
    handler: ActionCommandHandler<Extract<ActionCommand, { type: TType }>>
  ): () => void;
  /** Executes matching bindings for one interaction and commits resulting UI updates. */
  executeInteraction(interaction: UIInteractionRecord): Promise<ActionResult[]>;
  /** Registers a reactive effect that runs when data nodes change. */
  registerEffect(id: string, effect: (dataNodes: StateNode[]) => void): () => void;
}

function normalizePlan(plan: ViewPlan): ViewPlan {
  return {
    ...plan,
    plan_version: plan.plan_version ?? CURRENT_VIEW_PLAN_VERSION,
    confidence: Number.isFinite(plan.confidence) ? Math.max(0, Math.min(1, plan.confidence)) : 0.5,
    bindings: plan.bindings ?? [],
  };
}

function mergeContext(
  base: ViewContext,
  patch: Partial<ViewContext>,
  proxyDataNodes: StateNode[],
): ViewContext {
  return {
    ...base,
    ...patch,
    // CRITICAL: always use the reactive proxy as the canonical dataNodes reference.
    // If patch.dataNodes was provided, the caller must have already synced them
    // into the dataStore before calling mergeContext.
    dataNodes: proxyDataNodes,
    tools: patch.tools ?? base.tools,
    availableWorkflows: patch.availableWorkflows ?? base.availableWorkflows,
    candidateBindings: patch.candidateBindings ?? base.candidateBindings,
    currentBindings: patch.currentBindings ?? base.currentBindings,
    projectionNodes: patch.projectionNodes ?? base.projectionNodes,
    sessionHistory: patch.sessionHistory ?? base.sessionHistory,
  };
}

function resolveToolCallPolicy(
  action: Extract<ActionCommand, { type: 'tool_call' }>,
  tool: ToolDefinition | undefined
): Required<ToolPolicy> {
  const inferredLane: ToolLane =
    tool?.execution?.mode === 'client'
      ? 'optimistic'
      : 'confirmed';
  const inferredRisk: ToolRisk =
    tool?.execution?.mode === 'client'
      ? 'safe'
      : 'risky';

  return {
    lane: action.policy?.lane ?? inferredLane,
    risk: action.policy?.risk ?? inferredRisk,
    rollbackMessage: action.policy?.rollbackMessage ?? 'Action failed. Reverted optimistic UI state.',
  };
}

const COMPONENT_STATE_SHADOW_SOURCE = 'component_state_shadow';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isComponentStateShadowNode(node: StateNode): boolean {
  return isRecord(node.metadata)
    && node.metadata.__anyaSource === COMPONENT_STATE_SHADOW_SOURCE;
}

function collectSpecComponents(spec: ViewSpec | null): Map<string, ViewNode> {
  const nodes = new Map<string, ViewNode>();
  if (!spec) return nodes;

  const stack = [...spec.nodes];
  while (stack.length > 0) {
    const next = stack.pop()!;
    nodes.set(next.id!, next);
    if (next.children?.length) {
      stack.push(...next.children);
    }
  }

  return nodes;
}

function syncComponentShadowNodes(
  dataStore: ReturnType<typeof createReactiveStateStore>,
  spec: ViewSpec | null,
): void {
  const nodeMap = collectSpecComponents(spec);

  for (let index = dataStore.state.dataNodes.length - 1; index >= 0; index -= 1) {
    const node = dataStore.state.dataNodes[index];
    if (isComponentStateShadowNode(node) && !nodeMap.has(node.id)) {
      dataStore.state.dataNodes.splice(index, 1);
    }
  }

  for (const component of nodeMap.values()) {
    const shadowNode: StateNode = {
      id: component.id!,
      kind: 'json',
      payload: deepClone(component.props),
      metadata: {
        __anyaSource: COMPONENT_STATE_SHADOW_SOURCE,
        componentType: component.type,
      },
      updatedAt: Date.now(),
    };

    const existingIndex = dataStore.state.dataNodes.findIndex((node) => node.id === component.id);
    if (existingIndex === -1) {
      dataStore.state.dataNodes.push(shadowNode);
      continue;
    }

    if (isComponentStateShadowNode(dataStore.state.dataNodes[existingIndex])) {
      dataStore.state.dataNodes[existingIndex] = shadowNode;
    }
  }
}

export function createViewEngine(opts?: {
  initialContext?: Partial<ViewContext>;
  allowedToolIds?: string[];
  maxExecutionHistory?: number;
  plannerStrategy?: ViewStrategyName;
  planningPolicy?: ViewPolicy;
  actionExecutor?: ActionCommandRunner;
}): ViewEngine {
  // Engine instances are host-scoped. State is fully in-memory and synchronous.
  const maxExecutionHistory = opts?.maxExecutionHistory ?? 200;
  const runtime = new ToolRuntime({
    allowedToolIds: opts?.allowedToolIds,
  });
  const actionExecutor = opts?.actionExecutor ?? new ActionCommandRunner();
  const dataStore = createReactiveStateStore(opts?.initialContext?.dataNodes ?? []);
  const listeners = new Set<() => void>();
  const staleInteractionError = 'State changed while interaction was running; skipped stale interaction result.';
  let stateRevision = 0;
  let interactionQueue: Promise<void> = Promise.resolve();
  const effects = new Map<string, (dataNodes: StateNode[]) => void>();

  const upsertStateNode = (node: StateNode): void => {
    dataStore.setNode({
      ...node,
      updatedAt: node.updatedAt ?? Date.now(),
    });
  };

  const removeStateNode = (nodeId: string): boolean => {
    const index = dataStore.state.dataNodes.findIndex((node) => node.id === nodeId);
    if (index === -1) return false;
    dataStore.state.dataNodes.splice(index, 1);
    return true;
  };

  const ensureStateNode = (
    nodeId: string,
    options?: StateMutationOptions,
  ): StateNode => {
    const existing = dataStore.state.dataNodes.find((node) => node.id === nodeId);
    if (existing) {
      if (options?.metadata) {
        existing.metadata = {
          ...(typeof existing.metadata === 'object' && existing.metadata !== null ? existing.metadata : {}),
          ...options.metadata,
        };
      }
      if (options?.kind && existing.kind !== options.kind) {
        existing.kind = options.kind;
      }
      existing.updatedAt = Date.now();
      return existing;
    }

    const created: StateNode = {
      id: nodeId,
      kind: options?.kind ?? 'json',
      payload: {},
      metadata: options?.metadata,
      updatedAt: Date.now(),
    };
    dataStore.state.dataNodes.push(created);
    return created;
  };

  const stateGraph: StateGraph = {
    getNodes() {
      return dataStore.state.dataNodes;
    },
    getNode(nodeId) {
      return dataStore.state.dataNodes.find((node) => node.id === nodeId);
    },
    setNodes(nodes) {
      dataStore.setNodes(nodes.map((node) => ({
        ...node,
        updatedAt: node.updatedAt ?? Date.now(),
      })));
    },
    upsertNode(node) {
      upsertStateNode(node);
    },
    removeNode(nodeId) {
      return removeStateNode(nodeId);
    },
    replaceNodeValue(nodeId, value, options) {
      const node = ensureStateNode(nodeId, options);
      node.payload = value;
      node.updatedAt = Date.now();
      return node;
    },
    setNodeValue(nodeId, path, value, options) {
      const node = ensureStateNode(nodeId, options);
      if (!path.trim()) {
        node.payload = value;
      } else {
        if (typeof node.payload !== 'object' || node.payload === null) {
          node.payload = {};
        }
        setDeepValue(node.payload, path, value);
      }
      node.updatedAt = Date.now();
      return node;
    },
    subscribe(listener) {
      return dataStore.subscribe(listener);
    },
  };

  const runEffects = () => {
    for (const effect of Array.from(effects.values())) {
      try {
        effect(dataStore.state.dataNodes);
      } catch (error) {
        getLogger().warn('[ViewEngine] Effect failed.', error);
      }
    }
  };

  let state: ViewState = {
    context: {
      context_version: 0,
      dataNodes: dataStore.state.dataNodes, // Use the proxy
      tools: opts?.initialContext?.tools ?? [],
      workflowContext: opts?.initialContext?.workflowContext,
      availableWorkflows: opts?.initialContext?.availableWorkflows ?? [],
      candidateSpec: opts?.initialContext?.candidateSpec ?? null,
      candidateBindings: opts?.initialContext?.candidateBindings ?? [],
      currentSpec: opts?.initialContext?.currentSpec ?? null,
      currentBindings: opts?.initialContext?.currentBindings ?? [],
      requestedMode: opts?.initialContext?.requestedMode,
      plannerStrategy: opts?.initialContext?.plannerStrategy ?? opts?.plannerStrategy,
      planningPolicy: opts?.initialContext?.planningPolicy ?? opts?.planningPolicy,
      newUserContext: opts?.initialContext?.newUserContext,
      projectionNodes: opts?.initialContext?.projectionNodes,
      sessionHistory: opts?.initialContext?.sessionHistory ?? [],
      persistentProfile: opts?.initialContext?.persistentProfile,
    },
    currentSpec: opts?.initialContext?.currentSpec ?? null,
    bindings: opts?.initialContext?.currentBindings ?? [],
    lastPlan: null,
    executionHistory: [],
  };

  syncComponentShadowNodes(dataStore, state.currentSpec);

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
    let node = dataStore.state.dataNodes.find((n: StateNode) => n.id === action.nodeId);
    if (!node) {
      // Auto-create missing data nodes so bindings don't silently fail
      node = { id: action.nodeId, kind: 'json', payload: {} } as StateNode;
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
  const registerCalculationTool: ToolDefinition = {
    id: 'register_calculation',
    name: 'Register Calculation',
    description: 'Registers a reactive calculation that updates a data node when dependencies change.',
    execution: { mode: 'client' },
  };
  
  runtime.registerTool(registerCalculationTool);
  runtime.registerHandler('register_calculation', ({ args }) => {
    const { targetNodeId, targetPath, formula, dependencies } = args as any;
    
    return (dataNodes: StateNode[]) => {
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
        getLogger().warn('[ViewEngine] Subscriber failed.', error);
      }
    }
  };

  const transact = <T>(update: (current: ViewState) => {
    nextState: ViewState;
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

    get stateGraph() {
      return stateGraph;
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

      let nextSpec: ViewSpec | null = state.currentSpec;
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
        nextSpec =
          normalizedPatch.currentSpec === undefined
            ? state.currentSpec
            : normalizedPatch.currentSpec ?? null;
        syncComponentShadowNodes(dataStore, nextSpec);
      } catch (error) {
        if (normalizedPatch.tools) {
          runtime.setTools(previousTools);
        }
        throw error;
      }
    },

    plan(request) {
      return transact((current) => {
        const context: ViewContext = {
          ...current.context,
          currentSpec: current.currentSpec,
          currentBindings: current.bindings,
          newUserContext: request?.newUserContext ?? current.context.newUserContext,
          workflowContext: request?.workflowContext ?? current.context.workflowContext,
          requestedMode: request?.requestedMode ?? current.context.requestedMode,
          plannerStrategy: request?.plannerStrategy ?? current.context.plannerStrategy,
          planningPolicy: request?.planningPolicy ?? current.context.planningPolicy,
          projectionNodes: request?.projectionNodes ?? current.context.projectionNodes,
          candidateSpec: request?.candidateSpec === undefined
            ? current.context.candidateSpec
            : request.candidateSpec,
          candidateBindings: request?.candidateBindings ?? current.context.candidateBindings,
        };
        const plan = normalizePlan(planView(context));
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
      const applied = transact((current) => {
        const normalized = normalizePlan(plan);
        const applied = applyViewPlan(current.currentSpec, current.bindings, normalized);
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
      syncComponentShadowNodes(dataStore, applied.spec);
      return applied;
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

        let workingSpec: ViewSpec = applyOptimisticUpdate(startState.currentSpec, interaction);
        let expectedRevision = startRevision;
        const commitPreview = (spec: ViewSpec) => {
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
          syncComponentShadowNodes(dataStore, spec);
          expectedRevision = stateRevision;
        };

        if (workingSpec !== startState.currentSpec) {
          commitPreview(workingSpec);
        }

        // 1) Resolve bindings that match this event.
        const matchingBindings = startState.bindings.filter((binding) => {
          if (binding.nodeId !== interaction.nodeId) return false;
          if (binding.trigger && interaction.trigger && binding.trigger !== interaction.trigger) {
            return false;
          }
          if (binding.actionMatch && binding.actionMatch !== interaction.action) return false;
          return true;
        });

        if (matchingBindings.length === 0) return [];

        const records: ActionResult[] = [];

        for (const binding of matchingBindings) {
          let preBindingSpec: ViewSpec | undefined;
          const action = binding.action;
          let optimisticApplied = false;
          let resolvedLane: ToolLane | undefined;
          let resolvedRisk: ToolRisk | undefined;
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
              const optimistic = applyLocalViewChanges(
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
              workingSpec = setViewNodeProp(workingSpec, binding.nodeId, 'busy', true);
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
          let nextRecord: ActionResult = outcome.record;

          if (resolvedRisk === 'risky') {
            nextSpec = setViewNodeProp(nextSpec, binding.nodeId, 'busy', false);
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
        const committedRecords = transact((current) => {
          const stale = stateRevision !== expectedRevision;
          const committedRecords: ActionResult[] = stale
            ? records.map((record): ActionResult => ({
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
        if (state.currentSpec === workingSpec) {
          syncComponentShadowNodes(dataStore, workingSpec);
        }
        return committedRecords;
      });
    },

    registerEffect(id, effect) {
      effects.set(id, effect);
      // Trigger once immediately
      try {
        effect(dataStore.state.dataNodes);
      } catch (error) {
        getLogger().warn(`[ViewEngine] Initial effect '${id}' failed.`, error);
      }
      return () => {
        effects.delete(id);
      };
    },
  };
}
