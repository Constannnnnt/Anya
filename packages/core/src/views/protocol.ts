/**
 * Plain host protocol boundary for "context -> view plan".
 * Converts external request payloads into internal planning context.
 */
import type { UIInteractionRecord, UIRenderSpec } from '../types';
import type {
  ActionBinding,
  StateNode,
  ToolDefinition,
  ViewComponentSlots,
  ViewContext,
  ViewPlan,
  ViewPolicy,
  ViewRecipe,
  ViewStrategyName,
  ViewMode,
} from './types';
import { planView } from './updatePlanner';

export interface ViewRequest {
  data?: StateNode[];
  tools?: ToolDefinition[];
  workflowContext?: string;
  workflows?: ViewRecipe[];
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: ActionBinding[];
  requestedMode?: ViewMode;
  plannerStrategy?: ViewStrategyName;
  planningPolicy?: ViewPolicy;
  userContext?: string;
  projectionComponents?: Partial<ViewComponentSlots>;
  currentSpec?: UIRenderSpec | null;
  currentBindings?: ActionBinding[];
  sessionHistory?: UIInteractionRecord[];
  persistentProfile?: string;
}

export interface ViewResult {
  plan: ViewPlan;
  spec: UIRenderSpec;
  bindings: ActionBinding[];
  mode: ViewMode;
  confidence: number;
}

export function toViewContext(input: ViewRequest): ViewContext {
  return {
    context_version: 0,
    dataNodes: input.data ?? [],
    tools: input.tools ?? [],
    workflowContext: input.workflowContext,
    availableWorkflows: input.workflows ?? [],
    candidateSpec: input.candidateSpec ?? null,
    candidateBindings: input.candidateBindings ?? [],
    requestedMode: input.requestedMode,
    plannerStrategy: input.plannerStrategy,
    planningPolicy: input.planningPolicy,
    currentSpec: input.currentSpec ?? null,
    currentBindings: input.currentBindings ?? [],
    newUserContext: input.userContext,
    projectionComponents: input.projectionComponents,
    sessionHistory: input.sessionHistory,
    persistentProfile: input.persistentProfile,
  };
}

export function planViewFromContext(input: ViewRequest): ViewResult {
  const plan = planView(toViewContext(input));
  return {
    plan,
    spec: plan.ui_spec,
    bindings: plan.bindings,
    mode: plan.mode,
    confidence: plan.confidence,
  };
}
