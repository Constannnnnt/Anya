/**
 * Deterministic presentation planner.
 * Chooses patch vs rebuild and computes confidence from policy + context.
 */
import type { UIComponentSpec, UIRenderSpec } from '../types';
import {
  CURRENT_PRESENTATION_PLAN_VERSION,
  type PresentationContext,
  type PresentationMode,
  type PresentationOperation,
  type PresentationPlan,
  type PresentationPlannerStrategyName,
  type PresentationPlanningPolicy,
  type UIBinding,
} from './types';
import { buildUIFromData, extractBindingsFromSpec } from './uiBuilder';

interface CandidateProjection {
  spec: UIRenderSpec;
  bindings: UIBinding[];
  source: 'agent' | 'fallback';
}

interface ResolvedPlanningPolicy {
  patchComplexityBudget: number;
  patchComplexityBaselineMin: number;
  patchConfidenceBase: number;
  rebuildConfidenceBase: number;
}

interface PlannerComputation {
  candidate: CandidateProjection;
  currentSpec: UIRenderSpec | null;
  currentBindings: UIBinding[];
  operations: PresentationOperation[];
  patchComplexity: number;
  workflowShift: boolean;
  layoutShift: boolean;
  requestedRebuild: boolean;
}

interface PlannerStrategyResult {
  mode: PresentationMode;
  reasons: string[];
}

type PlannerStrategy = (input: PlannerComputation, policy: ResolvedPlanningPolicy) => PlannerStrategyResult;

const DEFAULT_POLICY: ResolvedPlanningPolicy = {
  patchComplexityBudget: 2.5,
  patchComplexityBaselineMin: 4,
  patchConfidenceBase: 0.95,
  rebuildConfidenceBase: 0.72,
};

const STRATEGIES: Record<PresentationPlannerStrategyName, PlannerStrategy> = {
  deterministic: (input, policy) => {
    const reasons: string[] = [];
    if (input.requestedRebuild) reasons.push('requested-rebuild');
    if (!input.currentSpec) reasons.push('no-current-spec');
    if (input.workflowShift) reasons.push('workflow-shift');
    if (input.layoutShift) reasons.push('layout-shift');
    if (input.patchComplexity > policy.patchComplexityBudget) reasons.push('complexity-budget');

    return {
      mode: reasons.length > 0 ? 'rebuild' : 'patch',
      reasons,
    };
  },
  always_rebuild: () => ({
    mode: 'rebuild',
    reasons: ['strategy-always-rebuild'],
  }),
  always_patch: () => ({
    mode: 'patch',
    reasons: ['strategy-always-patch'],
  }),
};

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function resolvePolicy(policy: PresentationPlanningPolicy | undefined): ResolvedPlanningPolicy {
  return {
    patchComplexityBudget: policy?.patchComplexityBudget ?? DEFAULT_POLICY.patchComplexityBudget,
    patchComplexityBaselineMin:
      policy?.patchComplexityBaselineMin ?? DEFAULT_POLICY.patchComplexityBaselineMin,
    patchConfidenceBase: policy?.patchConfidenceBase ?? DEFAULT_POLICY.patchConfidenceBase,
    rebuildConfidenceBase: policy?.rebuildConfidenceBase ?? DEFAULT_POLICY.rebuildConfidenceBase,
  };
}

function countComponents(components: UIComponentSpec[]): number {
  let count = 0;
  const stack = [...components];
  while (stack.length > 0) {
    const component = stack.pop()!;
    count += 1;
    if (component.children?.length) {
      stack.push(...component.children);
    }
  }
  return count;
}

function resolveWorkflowContext(context: PresentationContext): string | undefined {
  return context.workflowContext;
}

function resolveAvailableWorkflowContexts(context: PresentationContext) {
  return context.availableWorkflowContexts;
}

function resolvePlannerStrategyName(context: PresentationContext): PresentationPlannerStrategyName {
  const strategy = context.plannerStrategy ?? 'deterministic';
  return STRATEGIES[strategy] ? strategy : 'deterministic';
}

function resolveCandidateProjection(context: PresentationContext): CandidateProjection {
  if (context.candidateSpec) {
    const bindings = context.candidateBindings && context.candidateBindings.length > 0
      ? context.candidateBindings
      : extractBindingsFromSpec(context.candidateSpec).bindings;
    return {
      spec: context.candidateSpec,
      bindings,
      source: 'agent',
    };
  }

  const fallback = buildUIFromData(context.dataNodes, context.tools, {
    workflowContext: resolveWorkflowContext(context),
    availableWorkflowContexts: resolveAvailableWorkflowContexts(context),
    newUserContext: context.newUserContext,
    fallbackComponents: context.fallbackComponents,
  });
  return {
    spec: fallback.spec,
    bindings: fallback.bindings,
    source: 'fallback',
  };
}

function buildPatchOperations(
  currentComponents: UIComponentSpec[],
  projectedComponents: UIComponentSpec[],
  currentBindings: UIBinding[],
  projectedBindings: UIBinding[]
): PresentationOperation[] {
  const operations: PresentationOperation[] = [];

  const projectedRootIds = new Set(projectedComponents.map((component) => component.id));
  for (const component of projectedComponents) {
    operations.push({
      type: 'upsert_component',
      component,
    });
  }

  for (const component of currentComponents) {
    if (!projectedRootIds.has(component.id)) {
      operations.push({
        type: 'remove_component',
        componentId: component.id,
      });
    }
  }

  const projectedBindingIds = new Set(projectedBindings.map((binding) => binding.id));
  for (const binding of projectedBindings) {
    operations.push({
      type: 'upsert_binding',
      binding,
    });
  }

  for (const binding of currentBindings) {
    if (!projectedBindingIds.has(binding.id)) {
      operations.push({
        type: 'remove_binding',
        bindingId: binding.id,
      });
    }
  }

  if (projectedComponents.length === 0) {
    operations.push({
      type: 'replace_components',
      components: [],
    });
  }

  return operations;
}

function computePatchComplexity(
  operations: PresentationOperation[],
  currentSpec: UIRenderSpec | null,
  currentBindings: UIBinding[],
  candidateSpec: UIRenderSpec,
  candidateBindings: UIBinding[],
  policy: ResolvedPlanningPolicy
): number {
  const currentComponentCount = currentSpec ? countComponents(currentSpec.components) : 0;
  const nextComponentCount = countComponents(candidateSpec.components);
  const baseline = Math.max(
    policy.patchComplexityBaselineMin,
    currentComponentCount
      + nextComponentCount
      + currentBindings.length
      + candidateBindings.length
  );
  return operations.length / baseline;
}

function summarizeRebuildReasons(reasons: string[]): string {
  if (reasons.includes('strategy-always-rebuild')) {
    return 'Planner strategy is always_rebuild.';
  }
  if (reasons.includes('requested-rebuild')) {
    return 'Requested rebuild mode was supplied by the caller.';
  }
  if (reasons.includes('no-current-spec')) {
    return 'No current UI tree is available, so rebuild is required.';
  }
  if (reasons.includes('workflow-shift')) {
    return 'Workflow context changed, so rebuild is required to honor the new SOP.';
  }
  if (reasons.includes('layout-shift')) {
    return 'Layout changed, so rebuild is required for structural consistency.';
  }
  if (reasons.includes('complexity-budget')) {
    return 'Patch complexity exceeded deterministic budget; rebuilding for stability.';
  }
  return 'Rebuild selected for deterministic consistency.';
}

function summarizePatchRationale(source: CandidateProjection['source'], reasons: string[]): string {
  if (reasons.includes('strategy-always-patch')) {
    return 'Planner strategy is always_patch.';
  }
  if (source === 'agent') {
    return 'Patch current UI using the agent-provided candidate spec and bindings.';
  }
  return 'Patch current UI using deterministic fallback projection from current data/tools.';
}

function resolveRebuildConfidence(reasons: string[], policy: ResolvedPlanningPolicy): number {
  let score = policy.rebuildConfidenceBase;
  if (reasons.includes('requested-rebuild')) score += 0.15;
  if (reasons.includes('no-current-spec')) score += 0.12;
  if (reasons.includes('workflow-shift')) score += 0.08;
  if (reasons.includes('layout-shift')) score += 0.05;
  return clamp01(score);
}

function resolvePatchConfidence(
  complexity: number,
  operationCount: number,
  policy: ResolvedPlanningPolicy
): number {
  const idlePenalty = operationCount === 0 ? 0.18 : 0;
  return clamp01(policy.patchConfidenceBase - (complexity * 0.45) - idlePenalty);
}

function computePlannerInputs(
  context: PresentationContext,
  policy: ResolvedPlanningPolicy
): PlannerComputation {
  const candidate = resolveCandidateProjection(context);
  const currentSpec = context.currentSpec ?? null;
  const currentBindings = context.currentBindings ?? [];
  const operations = buildPatchOperations(
    currentSpec?.components ?? [],
    candidate.spec.components,
    currentBindings,
    candidate.bindings
  );
  const patchComplexity = computePatchComplexity(
    operations,
    currentSpec,
    currentBindings,
    candidate.spec,
    candidate.bindings,
    policy
  );

  const currentWorkflow = currentSpec?.skill;
  const nextWorkflow = resolveWorkflowContext(context) ?? candidate.spec.skill;

  return {
    candidate,
    currentSpec,
    currentBindings,
    operations,
    patchComplexity,
    workflowShift: Boolean(currentWorkflow && nextWorkflow && currentWorkflow !== nextWorkflow),
    layoutShift: Boolean(currentSpec && currentSpec.layout !== candidate.spec.layout),
    requestedRebuild: context.requestedMode === 'rebuild',
  };
}

/**
 * Analyzes the current UI context to determine the confidence and strategy for creating
 * the next interface presentation. Generates a 'patch' plan if confidence is high, or
 * falls back to a full 'rebuild' plan to ensure deterministic state transitions.
 */
export function planUIUpdate(context: PresentationContext): PresentationPlan {
  const strategyName = resolvePlannerStrategyName(context);
  const strategy = STRATEGIES[strategyName];
  const policy = resolvePolicy(context.planningPolicy);
  const inputs = computePlannerInputs(context, policy);
  const decision = strategy(inputs, policy);

  if (decision.mode === 'rebuild') {
    return {
      plan_version: CURRENT_PRESENTATION_PLAN_VERSION,
      strategy: strategyName,
      reasons: decision.reasons,
      mode: 'rebuild',
      confidence: resolveRebuildConfidence(decision.reasons, policy),
      ui_spec: inputs.candidate.spec,
      bindings: inputs.candidate.bindings,
      rationale_short: summarizeRebuildReasons(decision.reasons),
      profile_observation: inputs.candidate.spec.profile_observation,
    };
  }

  return {
    plan_version: CURRENT_PRESENTATION_PLAN_VERSION,
    strategy: strategyName,
    reasons: decision.reasons,
    mode: 'patch',
    confidence: resolvePatchConfidence(inputs.patchComplexity, inputs.operations.length, policy),
    ui_spec: inputs.candidate.spec,
    bindings: inputs.candidate.bindings,
    operations: inputs.operations,
    rationale_short: summarizePatchRationale(inputs.candidate.source, decision.reasons),
    profile_observation: inputs.candidate.spec.profile_observation,
  };
}
