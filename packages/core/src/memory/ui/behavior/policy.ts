import type {
  BehaviorAnalyzerFinding,
} from './analyzers';
import type {
  BehaviorFindingKind,
  BehaviorFindingSeverity,
} from './schemas';

export interface FindingInterpreterPolicy {
  mode: 'calibration_required';
  allowResolvedMemoryPromotion: boolean;
  diagnosticConfidenceMin: number;
  localAdaptationConfidenceMin: number;
  localAdaptationSeverityMin: BehaviorFindingSeverity;
  allowedKindsByAnalyzer: Record<string, BehaviorFindingKind[]>;
  promotionRules: Partial<Record<
    Extract<BehaviorFindingKind, 'preference_candidate' | 'pattern_candidate' | 'reflection_candidate'>,
    {
      confidenceMin: number;
      supportMin: number;
    }
  >>;
}

const DEFAULT_ALLOWED_KINDS_BY_ANALYZER: FindingInterpreterPolicy['allowedKindsByAnalyzer'] = {
  rework_friction: ['reflection_candidate', 'diagnostic', 'warning'],
  error_recovery_cost: ['reflection_candidate', 'pattern_candidate', 'diagnostic', 'warning'],
  lostness_light: ['reflection_candidate', 'diagnostic', 'warning'],
  hick_hyman: ['reflection_candidate', 'diagnostic'],
  klm_light: ['reflection_candidate', 'pattern_candidate', 'diagnostic'],
  fitts_law: ['reflection_candidate', 'diagnostic'],
  steering_law: ['reflection_candidate', 'diagnostic'],
  form_friction: ['reflection_candidate', 'diagnostic', 'warning'],
  focus_switch_cost: ['reflection_candidate', 'diagnostic'],
  information_scent: ['reflection_candidate', 'diagnostic', 'warning'],
  practice_curve: ['pattern_candidate', 'reflection_candidate', 'diagnostic'],
};

export const DEFAULT_FINDING_INTERPRETER_POLICY: FindingInterpreterPolicy = Object.freeze({
  mode: 'calibration_required',
  allowResolvedMemoryPromotion: false,
  diagnosticConfidenceMin: 0.5,
  localAdaptationConfidenceMin: 0.75,
  localAdaptationSeverityMin: 'high',
  allowedKindsByAnalyzer: DEFAULT_ALLOWED_KINDS_BY_ANALYZER,
  promotionRules: {},
});

export function isFindingKindAllowed(
  policy: FindingInterpreterPolicy,
  analyzerId: string,
  kind: BehaviorFindingKind,
): boolean {
  return (policy.allowedKindsByAnalyzer[analyzerId] ?? []).includes(kind);
}

export function shouldRetainAsDiagnostic(
  policy: FindingInterpreterPolicy,
  finding: Pick<BehaviorAnalyzerFinding, 'confidence'>,
): boolean {
  return finding.confidence >= policy.diagnosticConfidenceMin;
}

export function shouldRetainForLocalAdaptation(
  policy: FindingInterpreterPolicy,
  finding: Pick<BehaviorAnalyzerFinding, 'confidence' | 'severity'>,
): boolean {
  const severityRank = severityToRank(finding.severity ?? 'low');
  return finding.confidence >= policy.localAdaptationConfidenceMin
    && severityRank >= severityToRank(policy.localAdaptationSeverityMin);
}

export function shouldPromoteFinding(
  policy: FindingInterpreterPolicy,
  finding: Pick<BehaviorAnalyzerFinding, 'kind' | 'confidence' | 'support'>,
): boolean {
  if (!policy.allowResolvedMemoryPromotion) {
    return false;
  }
  if (
    finding.kind !== 'preference_candidate'
    && finding.kind !== 'pattern_candidate'
    && finding.kind !== 'reflection_candidate'
  ) {
    return false;
  }
  const rule = policy.promotionRules[finding.kind];
  if (!rule) {
    return false;
  }
  return finding.confidence >= rule.confidenceMin
    && finding.support >= rule.supportMin;
}

function severityToRank(severity: BehaviorFindingSeverity): number {
  switch (severity) {
    case 'high':
      return 3;
    case 'medium':
      return 2;
    case 'low':
    default:
      return 1;
  }
}
