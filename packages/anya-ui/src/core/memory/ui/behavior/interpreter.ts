import { nextGeneratedId } from '../../../id';
import type {
  InteractionPattern,
  MemoryDerivation,
  PreferenceMemory,
  Reflection,
} from '../schemas';
import type { MemoryStore } from '../store';
import type { BehaviorFinding } from './schemas';
import type { BehaviorStore } from './store';
import {
  isFindingKindAllowed,
  shouldPromoteFinding,
  shouldRetainAsDiagnostic,
  type FindingInterpreterPolicy,
} from './policy';

export type FindingOperation =
  | { type: 'promote_preference'; finding: BehaviorFinding; preference: PreferenceMemory }
  | { type: 'promote_pattern'; finding: BehaviorFinding; pattern: InteractionPattern }
  | { type: 'promote_reflection'; finding: BehaviorFinding; reflection: Reflection }
  | { type: 'retain_diagnostic'; finding: BehaviorFinding; reason: string }
  | { type: 'ignore'; finding: BehaviorFinding; reason: string };

export interface FindingInterpretationResult {
  retainedFindings: BehaviorFinding[];
  operations: FindingOperation[];
  ignored: Array<{ findingId: string; reason: string }>;
}

export interface IntegrateBehaviorFindingsResult {
  retainedFindings: number;
  promotedPreferences: number;
  promotedPatterns: number;
  promotedReflections: number;
  ignored: number;
}

export function interpretBehaviorFindings(
  actorId: string,
  findings: BehaviorFinding[],
  policy: FindingInterpreterPolicy,
  now = Date.now(),
): FindingInterpretationResult {
  const retainedFindings: BehaviorFinding[] = [];
  const operations: FindingOperation[] = [];
  const ignored: Array<{ findingId: string; reason: string }> = [];

  for (const finding of findings) {
    if (!isFindingKindAllowed(policy, finding.analyzerId, finding.kind)) {
      ignored.push({ findingId: finding.id, reason: 'kind-not-allowed-for-analyzer' });
      operations.push({ type: 'ignore', finding, reason: 'kind-not-allowed-for-analyzer' });
      continue;
    }

    if (finding.kind === 'diagnostic' || finding.kind === 'warning') {
      if (shouldRetainAsDiagnostic(policy, finding)) {
        retainedFindings.push(finding);
        operations.push({ type: 'retain_diagnostic', finding, reason: 'diagnostic-retained' });
      } else {
        ignored.push({ findingId: finding.id, reason: 'diagnostic-confidence-too-low' });
        operations.push({ type: 'ignore', finding, reason: 'diagnostic-confidence-too-low' });
      }
      continue;
    }

    if (shouldPromoteFinding(policy, finding)) {
      retainedFindings.push(finding);
      switch (finding.kind) {
        case 'preference_candidate':
          operations.push({
            type: 'promote_preference',
            finding,
            preference: toPreference(actorId, finding, now),
          });
          break;
        case 'pattern_candidate':
          operations.push({
            type: 'promote_pattern',
            finding,
            pattern: toPattern(actorId, finding, now),
          });
          break;
        case 'reflection_candidate':
          operations.push({
            type: 'promote_reflection',
            finding,
            reflection: toReflection(actorId, finding, now),
          });
          break;
      }
      continue;
    }

    if (shouldRetainAsDiagnostic(policy, finding)) {
      retainedFindings.push(finding);
      operations.push({ type: 'retain_diagnostic', finding, reason: 'promotion-threshold-not-met' });
      continue;
    }

    ignored.push({ findingId: finding.id, reason: 'below-retention-threshold' });
    operations.push({ type: 'ignore', finding, reason: 'below-retention-threshold' });
  }

  return { retainedFindings, operations, ignored };
}

export async function integrateBehaviorFindings(input: {
  actorId: string;
  findings: BehaviorFinding[];
  policy: FindingInterpreterPolicy;
  memoryStore: MemoryStore;
  behaviorStore: BehaviorStore;
  now?: number;
}): Promise<IntegrateBehaviorFindingsResult> {
  const now = input.now ?? Date.now();
  const interpreted = interpretBehaviorFindings(input.actorId, input.findings, input.policy, now);
  if (interpreted.retainedFindings.length > 0) {
    await input.behaviorStore.upsertFindings(interpreted.retainedFindings);
  }

  let promotedPreferences = 0;
  let promotedPatterns = 0;
  let promotedReflections = 0;

  for (const operation of interpreted.operations) {
    switch (operation.type) {
      case 'promote_preference':
        await input.memoryStore.upsertPreference(operation.preference);
        promotedPreferences += 1;
        break;
      case 'promote_pattern':
        await input.memoryStore.upsertPattern(operation.pattern);
        promotedPatterns += 1;
        break;
      case 'promote_reflection':
        await input.memoryStore.upsertReflection(operation.reflection);
        promotedReflections += 1;
        break;
      default:
        break;
    }
  }

  return {
    retainedFindings: interpreted.retainedFindings.length,
    promotedPreferences,
    promotedPatterns,
    promotedReflections,
    ignored: interpreted.ignored.length,
  };
}

function toPreference(actorId: string, finding: BehaviorFinding, now: number): PreferenceMemory {
  const statement = asString(finding.payload.statement) ?? humanizeConceptKey(finding.conceptKey);
  const category = asString(finding.payload.category) ?? 'interaction';
  return {
    id: nextGeneratedId('pref'),
    actorId,
    category,
    key: sanitizeKey(finding.conceptKey),
    value: statement,
    statement,
    signalType: 'implicit',
    confidence: finding.confidence,
    support: finding.support,
    firstSeenTs: now,
    lastSeenTs: now,
    status: 'active',
    derivation: toDerivation(finding),
  };
}

function toPattern(actorId: string, finding: BehaviorFinding, now: number): InteractionPattern {
  const sequenceKey = asString(finding.payload.sequenceKey) ?? humanizeConceptKey(finding.conceptKey);
  const taskClass = deriveTaskClass(finding);
  const sequence = Array.isArray(finding.payload.sequence)
    ? finding.payload.sequence.filter((value): value is string => typeof value === 'string')
    : sequenceKey.split(' -> ').map((value) => value.trim()).filter(Boolean);
  const outcome = finding.payload.outcome === 'failure' ? 'failure' : 'success';
  return {
    id: nextGeneratedId('pat'),
    actorId,
    taskClass,
    sequenceKey,
    sequenceJson: JSON.stringify(sequence),
    outcome,
    confidence: finding.confidence,
    support: finding.support,
    lastSeenTs: now,
    derivation: toDerivation(finding),
  };
}

function toReflection(actorId: string, finding: BehaviorFinding, now: number): Reflection {
  const title = asString(finding.payload.title) ?? humanizeConceptKey(finding.conceptKey);
  const hints = asString(finding.payload.hints)
    ?? buildReflectionHint(finding);
  const useCases = asString(finding.payload.useCases)
    ?? (finding.scopeKey ? `Applies within ${finding.scopeKey}.` : 'Applies when repeated interaction evidence supports this guidance.');
  return {
    id: nextGeneratedId('ref'),
    actorId,
    title,
    useCases,
    hints,
    confidence: finding.confidence,
    updatedTs: now,
    derivation: toDerivation(finding),
  };
}

function toDerivation(finding: BehaviorFinding): MemoryDerivation {
  return {
    source: 'behavior_analysis',
    findingId: finding.id,
    analyzerId: finding.analyzerId,
    confidence: finding.confidence,
    support: finding.support,
    severity: finding.severity,
    scopeKey: finding.scopeKey,
    evidenceRefs: [...finding.evidenceRefs],
  };
}

function deriveTaskClass(finding: BehaviorFinding): string {
  if (finding.scopeKey?.startsWith('context:')) {
    return finding.scopeKey.slice('context:'.length);
  }
  return sanitizeKey(finding.conceptKey) || 'behavior';
}

function buildReflectionHint(finding: BehaviorFinding): string {
  const metrics = Object.entries(finding.payload)
    .filter(([, value]) => typeof value === 'number' || typeof value === 'string')
    .slice(0, 3)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');
  return metrics
    ? `${humanizeConceptKey(finding.conceptKey)} observed (${metrics}).`
    : `${humanizeConceptKey(finding.conceptKey)} observed from repeated interaction evidence.`;
}

function humanizeConceptKey(value: string): string {
  return value
    .split(/[:_\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function sanitizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'behavior';
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}
