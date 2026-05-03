/**
 * Behavior Composite Reducer
 *
 * Fuses raw analyzer findings into 4 composite scores per (actor, contextArchetype):
 *   - motor_friction       ← fitts_law, steering_law
 *   - cognitive_load       ← hick_hyman, klm_light, focus_switch_cost
 *   - wayfinding_health    ← information_scent, lostness_light
 *   - input_friction       ← form_friction, error_recovery_cost, rework_friction
 *
 * Score = Σ(confidence_i × severityScore_i) / Σ(confidence_i), in [0,1].
 * Composite confidence is the support-weighted mean of contributor confidences.
 * Composite severity is derived from the score using fixed thresholds.
 *
 * practice_curve is intentionally excluded — it is a trajectory signal,
 * not a cost, and aggregating it would obscure direction of change.
 */

import { severityFromScore, severityToScore } from './severity';
import type {
  BehaviorComposite,
  BehaviorCompositeKind,
  BehaviorFinding,
} from './schemas';

const ANALYZER_TO_COMPOSITE: Record<string, BehaviorCompositeKind> = {
  fitts_law: 'motor_friction',
  steering_law: 'motor_friction',
  hick_hyman: 'cognitive_load',
  klm_light: 'cognitive_load',
  focus_switch_cost: 'cognitive_load',
  information_scent: 'wayfinding_health',
  lostness_light: 'wayfinding_health',
  form_friction: 'input_friction',
  error_recovery_cost: 'input_friction',
  rework_friction: 'input_friction',
};

export function getCompositeKindForAnalyzer(
  analyzerId: string,
): BehaviorCompositeKind | undefined {
  return ANALYZER_TO_COMPOSITE[analyzerId];
}

export interface BuildBehaviorCompositesInput {
  actorId: string;
  findings: BehaviorFinding[];
  now: number;
}

/**
 * Build composite scores from a batch of analyzer findings.
 * One composite per (kind, contextArchetype) is produced when at least
 * one contributing finding is present.
 */
export function buildBehaviorComposites(
  input: BuildBehaviorCompositesInput,
): BehaviorComposite[] {
  const grouped = new Map<string, BehaviorFinding[]>();

  for (const finding of input.findings) {
    const kind = ANALYZER_TO_COMPOSITE[finding.analyzerId];
    if (!kind) continue;
    const contextArchetype = resolveFindingContextArchetype(finding);
    if (!contextArchetype) continue;
    const groupKey = `${kind}::${contextArchetype}`;
    const bucket = grouped.get(groupKey);
    if (bucket) {
      bucket.push(finding);
      continue;
    }
    grouped.set(groupKey, [finding]);
  }

  const composites: BehaviorComposite[] = [];
  for (const [groupKey, members] of grouped) {
    const separatorIndex = groupKey.indexOf('::');
    const kind = groupKey.slice(0, separatorIndex) as BehaviorCompositeKind;
    const contextArchetype = groupKey.slice(separatorIndex + 2);
    composites.push(reduceToComposite({
      actorId: input.actorId,
      kind,
      contextArchetype,
      members,
      now: input.now,
    }));
  }

  return composites;
}

interface ReduceInput {
  actorId: string;
  kind: BehaviorCompositeKind;
  contextArchetype: string;
  members: BehaviorFinding[];
  now: number;
}

function reduceToComposite(input: ReduceInput): BehaviorComposite {
  let weightedSeveritySum = 0;
  let confidenceSum = 0;
  let supportWeightedConfidenceSum = 0;
  let supportSum = 0;
  let windowStartTs = Number.POSITIVE_INFINITY;
  let windowEndTs = Number.NEGATIVE_INFINITY;
  const contributingAnalyzers = new Set<string>();
  const findingIds: string[] = [];

  for (const finding of input.members) {
    const severityScore = severityToScore(finding.severity);
    weightedSeveritySum += finding.confidence * severityScore;
    confidenceSum += finding.confidence;
    supportWeightedConfidenceSum += finding.confidence * Math.max(finding.support, 1);
    supportSum += finding.support;
    if (finding.createdTs < windowStartTs) windowStartTs = finding.createdTs;
    if (finding.createdTs > windowEndTs) windowEndTs = finding.createdTs;
    contributingAnalyzers.add(finding.analyzerId);
    findingIds.push(finding.id);
  }

  const score = confidenceSum > 0 ? weightedSeveritySum / confidenceSum : 0;
  const compositeConfidence = supportSum > 0
    ? supportWeightedConfidenceSum / Math.max(supportSum, input.members.length)
    : confidenceSum / input.members.length;

  return {
    id: `bcomp:${input.actorId}:${input.kind}:${input.contextArchetype}`,
    actorId: input.actorId,
    kind: input.kind,
    contextArchetype: input.contextArchetype,
    score,
    severity: severityFromScore(score),
    confidence: clampUnit(compositeConfidence),
    support: supportSum,
    contributingAnalyzers: [...contributingAnalyzers],
    findingIds,
    windowStartTs: Number.isFinite(windowStartTs) ? windowStartTs : input.now,
    windowEndTs: Number.isFinite(windowEndTs) ? windowEndTs : input.now,
    updatedTs: input.now,
  };
}

export function resolveFindingContextArchetype(finding: BehaviorFinding): string | undefined {
  const payloadContext = finding.payload?.contextArchetype;
  if (typeof payloadContext === 'string' && payloadContext.trim().length > 0) {
    return payloadContext.trim();
  }
  if (finding.scopeKey?.startsWith('context:')) {
    return finding.scopeKey.slice('context:'.length);
  }
  return undefined;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
