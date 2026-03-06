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
} from './types';
import { planUIUpdate } from './updatePlanner';
import { applyLocalUIUpdates, applyPresentationPlan, setComponentProp } from './uiUpdater';
import {
  BindingActionExecutor,
  type BindingActionHandler,
  resolveBindingValue,
  ToolRuntime,
  type ToolHandler,
} from './tools';

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
}

function normalizePlan(plan: PresentationPlan): PresentationPlan {
  return {
    ...plan,
    plan_version: plan.plan_version ?? CURRENT_PRESENTATION_PLAN_VERSION,
    confidence: Number.isFinite(plan.confidence) ? Math.max(0, Math.min(1, plan.confidence)) : 0.5,
    bindings: plan.bindings ?? [],
  };
}

function mergeContext(base: PresentationContext, patch: Partial<PresentationContext>): PresentationContext {
  return {
    ...base,
    ...patch,
    dataNodes: patch.dataNodes ?? base.dataNodes,
    tools: patch.tools ?? base.tools,
    availableWorkflowContexts: patch.availableWorkflowContexts ?? base.availableWorkflowContexts,
    candidateBindings: patch.candidateBindings ?? base.candidateBindings,
    currentBindings: patch.currentBindings ?? base.currentBindings,
    fallbackComponents: patch.fallbackComponents ?? base.fallbackComponents,
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
  const listeners = new Set<() => void>();
  const staleInteractionError = 'State changed while interaction was running; skipped stale interaction result.';
  let stateRevision = 0;
  let interactionQueue: Promise<void> = Promise.resolve();

  let state: PresentationState = {
    context: {
      context_version: 0,
      dataNodes: opts?.initialContext?.dataNodes ?? [],
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
      fallbackComponents: opts?.initialContext?.fallbackComponents,
      sessionHistory: opts?.initialContext?.sessionHistory ?? [],
      persistentProfile: opts?.initialContext?.persistentProfile,
    },
    currentSpec: opts?.initialContext?.currentSpec ?? null,
    bindings: opts?.initialContext?.currentBindings ?? [],
    lastPlan: null,
    executionHistory: [],
  };

  runtime.registerTools(state.context.tools);

  const notify = () => {
    for (const listener of listeners) {
      listener();
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

      try {
        transact((current) => ({
          nextState: {
            ...current,
            context: mergeContext(current.context, normalizedPatch),
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
          fallbackComponents: request?.fallbackComponents ?? current.context.fallbackComponents,
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
        runtime.unregisterTool(tool.id);
        transact((current) => ({
          nextState: {
            ...current,
            context: {
              ...current.context,
              tools: current.context.tools.filter((existing) => existing.id !== tool.id),
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
              setComponentProp(workingSpec, binding.componentId, 'busy', true);
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
            setComponentProp(nextSpec, binding.componentId, 'busy', false);
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
  };
}
