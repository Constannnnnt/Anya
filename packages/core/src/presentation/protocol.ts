/**
 * Plain presentation protocol boundary for host apps.
 * Converts external request payloads into internal planning context.
 */
import type {
  PresentationContext,
  PresentationSkill,
  PresentationMode,
  PresentationPlan,
  PresentationPlannerStrategyName,
  PresentationPlanningPolicy,
  ToolManifest,
  UIBinding,
  DataNode,
  ProjectionComponentTypes,
} from './types';
import { planUIUpdate } from './updatePlanner';
import type {
  UIRenderSpec,
  UIInteractionRecord,
} from '../types';

/**
 * Plain input contract for "context -> presentation plan".
 * This keeps host integrations simple and avoids leaking internal naming.
 */
export interface PresentationRequest {
  data?: DataNode[];
  tools?: ToolManifest[];
  workflowContext?: string;
  workflowContexts?: PresentationSkill[];
  candidateSpec?: UIRenderSpec | null;
  candidateBindings?: UIBinding[];
  requestedMode?: PresentationMode;
  plannerStrategy?: PresentationPlannerStrategyName;
  planningPolicy?: PresentationPlanningPolicy;
  userContext?: string;
  projectionComponents?: Partial<ProjectionComponentTypes>;
  currentSpec?: UIRenderSpec | null;
  currentBindings?: UIBinding[];
  sessionHistory?: UIInteractionRecord[];
  persistentProfile?: string;
}

/**
 * Plain output contract for host apps.
 */
export interface PresentationResult {
  plan: PresentationPlan;
  spec: UIRenderSpec;
  bindings: UIBinding[];
  mode: PresentationMode;
  confidence: number;
}

/** Maps host-facing request input to the engine context shape. */
export function toPresentationContext(input: PresentationRequest): PresentationContext {
  return {
    context_version: 0,
    dataNodes: input.data ?? [],
    tools: input.tools ?? [],
    workflowContext: input.workflowContext,
    availableWorkflowContexts: input.workflowContexts ?? [],
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

/** Runs one deterministic planning pass for a host presentation request. */
export function planPresentation(input: PresentationRequest): PresentationResult {
  const plan = planUIUpdate(toPresentationContext(input));
  return {
    plan,
    spec: plan.ui_spec,
    bindings: plan.bindings,
    mode: plan.mode,
    confidence: plan.confidence,
  };
}
