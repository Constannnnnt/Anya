/**
 * ../../../core — UI Memory Retrieval Composer
 *
 * Retrieves and ranks consolidated memory for planner priors.
 * Implements §7.5 of the UI Memory System plan.
 */

import { shouldRetainForLocalAdaptation, type FindingInterpreterPolicy } from './behavior/policy';
import type { BehaviorFinding, BehaviorFindingSeverity } from './behavior/schemas';
import type { BehaviorStore } from './behavior/store';
import type { MemoryStore } from './store';
import type {
  InteractionPattern,
  MemoryDerivation,
  PreferenceMemory,
  Reflection,
} from './schemas';

// ─── Types ───────────────────────────────────────────────────────────────

export interface BehaviorRetrievalInput {
  store: BehaviorStore;
  policy: FindingInterpreterPolicy;
}

export interface BehaviorEvidenceMetric {
  label: string;
  value: string;
}

export interface BehaviorAdaptation {
  findingId: string;
  analyzerId: string;
  confidence: number;
  support: number;
  severity: BehaviorFindingSeverity;
  scopeKey?: string;
  summary: string;
  recommendation: string;
  metrics: BehaviorEvidenceMetric[];
}

export interface PlanningMemoryContext {
  preferences: RankedPreference[];
  patterns: RankedPattern[];
  reflections: Reflection[];
  behaviorAdaptations: RankedBehaviorAdaptation[];
}

export interface RankedPreference extends PreferenceMemory {
  rank: number;
}

export interface RankedPattern extends InteractionPattern {
  rank: number;
}

export interface RankedBehaviorAdaptation extends BehaviorAdaptation {
  rank: number;
}

export interface RetrievalConfig {
  /** Max preferences to return. Default: 5 */
  maxPreferences?: number;
  /** Max interaction patterns to return. Default: 5 */
  maxPatterns?: number;
  /** Max reflections to return. Default: 3 */
  maxReflections?: number;
  /** Max local adaptations derived from measured interactions. Default: 4 */
  maxBehaviorAdaptations?: number;
  /** Ranking weight for confidence. Default: 0.45 */
  confidenceWeight?: number;
  /** Ranking weight for recency. Default: 0.30 */
  recencyWeight?: number;
  /** Ranking weight for support count. Default: 0.25 */
  supportWeight?: number;
  /** Additional ranking weight for measured signal severity. Default: 0.20 */
  behaviorSeverityWeight?: number;
  /** Additional ranking weight for task-context relevance. Default: 0.20 */
  behaviorContextWeight?: number;
}

export interface BehaviorAdaptationCandidate extends BehaviorAdaptation {
  createdTs: number;
  contextScore: number;
}

// ─── Retrieval Composer ──────────────────────────────────────────────────

export class RetrievalComposer {
  private readonly config: Required<RetrievalConfig>;

  constructor(config?: RetrievalConfig) {
    this.config = {
      maxPreferences: config?.maxPreferences ?? 5,
      maxPatterns: config?.maxPatterns ?? 5,
      maxReflections: config?.maxReflections ?? 3,
      maxBehaviorAdaptations: config?.maxBehaviorAdaptations ?? 4,
      confidenceWeight: config?.confidenceWeight ?? 0.45,
      recencyWeight: config?.recencyWeight ?? 0.30,
      supportWeight: config?.supportWeight ?? 0.25,
      behaviorSeverityWeight: config?.behaviorSeverityWeight ?? 0.20,
      behaviorContextWeight: config?.behaviorContextWeight ?? 0.20,
    };
  }

  /**
   * Retrieve ranked planning memory context for an actor.
   */
  async retrievePlanningContext(
    store: MemoryStore,
    actorId: string,
    taskContext?: { taskClass?: string; category?: string },
    behavior?: BehaviorRetrievalInput,
  ): Promise<PlanningMemoryContext> {
    const [preferences, patterns, reflections, behaviorAdaptations] = await Promise.all([
      this.retrievePreferences(store, actorId, taskContext?.category),
      this.retrievePatterns(store, actorId, taskContext?.taskClass),
      store.findReflections(actorId, {
        limit: this.config.maxReflections,
      }),
      this.retrieveBehaviorAdaptations(actorId, taskContext?.taskClass, behavior),
    ]);

    return { preferences, patterns, reflections, behaviorAdaptations };
  }

  /**
   * Format planning memory context into a prompt-ready string.
   */
  formatForPrompt(ctx: PlanningMemoryContext): string {
    if (
      ctx.preferences.length === 0 &&
      ctx.patterns.length === 0 &&
      ctx.reflections.length === 0 &&
      ctx.behaviorAdaptations.length === 0
    ) {
      return '';
    }

    const sections: string[] = ['## UI Memory Priors'];

    if (ctx.preferences.length > 0) {
      sections.push('### Preferences');
      for (const preference of ctx.preferences) {
        sections.push(
          `- [${preference.category}] ${preference.statement} ${formatPreferenceDetails(preference)}`,
        );
      }
    }

    if (ctx.patterns.length > 0) {
      sections.push('### Interaction Patterns');
      for (const pattern of ctx.patterns) {
        sections.push(
          `- [${pattern.taskClass}] ${pattern.sequenceKey} → ${pattern.outcome} ${formatPatternDetails(pattern)}`,
        );
      }
    }

    if (ctx.reflections.length > 0) {
      sections.push('### Reflections');
      for (const reflection of ctx.reflections) {
        sections.push(
          `- ${reflection.title}: ${reflection.hints} ${formatReflectionDetails(reflection)}`,
        );
      }
    }

    if (ctx.behaviorAdaptations.length > 0) {
      sections.push('### Measured Interaction Signals');
      sections.push(
        'Use these to adapt the interface to repeated interaction cost or recurring successful habits.',
      );
      for (const adaptation of ctx.behaviorAdaptations) {
        sections.push(
          `- [${adaptation.severity}] ${adaptation.summary} Recommendation: ${adaptation.recommendation}${formatBehaviorEvidence(adaptation)}`,
        );
      }
    }

    sections.push(
      '',
      '> Note: These are planner priors. Current explicit user instructions always take precedence over stored or measured signals.',
    );

    return sections.join('\n');
  }

  // ── Internal ────────────────────────────────────────────────────────

  private async retrievePreferences(
    store: MemoryStore,
    actorId: string,
    category?: string,
  ): Promise<RankedPreference[]> {
    const prefs = await store.findPreferences(actorId, {
      category,
      status: 'active',
    });

    return this.rankPreferences(prefs).slice(0, this.config.maxPreferences);
  }

  private async retrievePatterns(
    store: MemoryStore,
    actorId: string,
    taskClass?: string,
  ): Promise<RankedPattern[]> {
    const patterns = await store.findPatterns(actorId, {
      taskClass,
      outcome: 'success',
    });

    return this.rankPatterns(patterns).slice(0, this.config.maxPatterns);
  }

  private async retrieveBehaviorAdaptations(
    actorId: string,
    taskClass: string | undefined,
    behavior?: BehaviorRetrievalInput,
  ): Promise<RankedBehaviorAdaptation[]> {
    if (!behavior) {
      return [];
    }

    const findings = await behavior.store.findFindings(actorId);
    const retained = findings.filter((finding) =>
      shouldRetainForLocalAdaptation(behavior.policy, finding),
    );
    if (retained.length === 0) {
      return [];
    }

    const deduped = dedupeFindings(retained);
    const adaptations = deduped.map((finding) =>
      buildBehaviorAdaptationCandidate(finding, taskClass),
    );

    return this.rankBehaviorAdaptations(adaptations).slice(0, this.config.maxBehaviorAdaptations);
  }

  private rankPreferences(prefs: PreferenceMemory[]): RankedPreference[] {
    if (prefs.length === 0) return [];

    const maxTs = Math.max(...prefs.map((pref) => pref.lastSeenTs));
    const minTs = Math.min(...prefs.map((pref) => pref.lastSeenTs));
    const tsRange = maxTs - minTs || 1;
    const maxSupport = Math.max(...prefs.map((pref) => pref.support));

    return prefs
      .map((pref) => ({
        ...pref,
        rank:
          this.config.confidenceWeight * pref.confidence +
          this.config.recencyWeight *
            ((pref.lastSeenTs - minTs) / tsRange) +
          this.config.supportWeight *
            (maxSupport > 0 ? pref.support / maxSupport : 0),
      }))
      .sort((left, right) => right.rank - left.rank);
  }

  private rankPatterns(patterns: InteractionPattern[]): RankedPattern[] {
    if (patterns.length === 0) return [];

    const maxTs = Math.max(...patterns.map((pattern) => pattern.lastSeenTs));
    const minTs = Math.min(...patterns.map((pattern) => pattern.lastSeenTs));
    const tsRange = maxTs - minTs || 1;
    const maxSupport = Math.max(...patterns.map((pattern) => pattern.support));

    return patterns
      .map((pattern) => ({
        ...pattern,
        rank:
          this.config.confidenceWeight * pattern.confidence +
          this.config.recencyWeight *
            ((pattern.lastSeenTs - minTs) / tsRange) +
          this.config.supportWeight *
            (maxSupport > 0 ? pattern.support / maxSupport : 0),
      }))
      .sort((left, right) => right.rank - left.rank);
  }

  private rankBehaviorAdaptations(
    adaptations: BehaviorAdaptationCandidate[],
  ): RankedBehaviorAdaptation[] {
    if (adaptations.length === 0) return [];

    const maxTs = Math.max(...adaptations.map((adaptation) => adaptation.createdTs));
    const minTs = Math.min(...adaptations.map((adaptation) => adaptation.createdTs));
    const tsRange = maxTs - minTs || 1;
    const maxSupport = Math.max(...adaptations.map((adaptation) => adaptation.support));

    return adaptations
      .map((adaptation) => ({
        ...adaptation,
        rank:
          this.config.confidenceWeight * adaptation.confidence +
          this.config.recencyWeight *
            ((adaptation.createdTs - minTs) / tsRange) +
          this.config.supportWeight *
            (maxSupport > 0 ? adaptation.support / maxSupport : 0) +
          this.config.behaviorSeverityWeight * severityToScore(adaptation.severity) +
          this.config.behaviorContextWeight * adaptation.contextScore,
      }))
      .sort((left, right) => right.rank - left.rank)
      .map(({ createdTs: _createdTs, contextScore: _contextScore, ...adaptation }) => adaptation);
  }
}

function formatPreferenceDetails(preference: PreferenceMemory): string {
  return formatInlineDetailList([
    `confidence: ${preference.confidence.toFixed(2)}`,
    preference.signalType,
    formatDerivation(preference.derivation),
  ]);
}

function formatPatternDetails(pattern: InteractionPattern): string {
  return formatInlineDetailList([
    `confidence: ${pattern.confidence.toFixed(2)}`,
    formatDerivation(pattern.derivation),
  ]);
}

function formatReflectionDetails(reflection: Reflection): string {
  return formatInlineDetailList([
    `confidence: ${reflection.confidence.toFixed(2)}`,
    formatDerivation(reflection.derivation),
  ]);
}

function formatDerivation(derivation: MemoryDerivation | undefined): string | undefined {
  if (!derivation) {
    return undefined;
  }
  if (derivation.source !== 'behavior_analysis') {
    return derivation.source.replace(/_/g, ' ');
  }

  const parts = ['behavior-derived'];
  if (typeof derivation.support === 'number') {
    parts.push(`support: ${derivation.support}`);
  }
  if (derivation.analyzerId) {
    parts.push(`analyzer: ${derivation.analyzerId}`);
  }
  return parts.join(', ');
}

function formatInlineDetailList(parts: Array<string | undefined>): string {
  const filtered = parts.filter((part): part is string => Boolean(part));
  return filtered.length > 0 ? `(${filtered.join(', ')})` : '';
}

function formatBehaviorEvidence(adaptation: BehaviorAdaptation): string {
  const metrics = [
    `confidence: ${adaptation.confidence.toFixed(2)}`,
    `support: ${adaptation.support}`,
    adaptation.metrics.length > 0
      ? `evidence: ${adaptation.metrics.map((metric) => `${metric.label}=${metric.value}`).join(', ')}`
      : undefined,
  ].filter((part): part is string => Boolean(part));

  return metrics.length > 0 ? ` (${metrics.join(', ')})` : '';
}

export function dedupeFindings(findings: BehaviorFinding[]): BehaviorFinding[] {
  const bestByConcept = new Map<string, BehaviorFinding>();

  for (const finding of findings) {
    const key = `${finding.analyzerId}::${finding.kind}::${finding.conceptKey}`;
    const existing = bestByConcept.get(key);
    if (!existing || scoreFindingForDedup(finding) > scoreFindingForDedup(existing)) {
      bestByConcept.set(key, finding);
    }
  }

  return [...bestByConcept.values()];
}

export function scoreFindingForDedup(finding: BehaviorFinding): number {
  return finding.confidence + finding.support * 0.01 + severityToScore(finding.severity) * 0.1;
}

export function buildBehaviorAdaptationCandidate(
  finding: BehaviorFinding,
  taskClass: string | undefined,
): BehaviorAdaptationCandidate {
  return {
    findingId: finding.id,
    analyzerId: finding.analyzerId,
    confidence: finding.confidence,
    support: finding.support,
    severity: finding.severity ?? 'low',
    scopeKey: finding.scopeKey,
    summary: buildAdaptationSummary(finding),
    recommendation: buildAdaptationRecommendation(finding),
    metrics: extractBehaviorMetrics(finding),
    createdTs: finding.createdTs,
    contextScore: computeContextScore(finding, taskClass),
  };
}

function buildAdaptationSummary(finding: BehaviorFinding): string {
  const contextLabel = describeFindingContext(finding);
  const sequenceKey = asNonEmptyString(finding.payload.sequenceKey);
  const titledSummary = asNonEmptyString(finding.payload.title);

  if (finding.kind === 'pattern_candidate' && sequenceKey) {
    if (finding.analyzerId === 'practice_curve') {
      return `A repeated successful sequence is emerging in ${contextLabel}: ${sequenceKey}.`;
    }
    return `A repeated recovery sequence is showing up in ${contextLabel}: ${sequenceKey}.`;
  }

  if (titledSummary) {
    return titledSummary.endsWith('.') ? titledSummary : `${titledSummary}.`;
  }

  switch (finding.analyzerId) {
    case 'rework_friction':
      return `Repeated correction loops are showing up in ${contextLabel}.`;
    case 'error_recovery_cost':
      return `Failure recovery is taking too many steps in ${contextLabel}.`;
    case 'lostness_light':
      return `People are revisiting and oscillating between views in ${contextLabel}.`;
    case 'hick_hyman':
      return `Choice-heavy moments are slowing decisions in ${contextLabel}.`;
    case 'klm_light':
      return `The interaction burden is high in ${contextLabel}.`;
    case 'fitts_law':
      return `Primary targets are too hard to acquire in ${contextLabel}.`;
    case 'steering_law':
      return `Drag paths are too constrained in ${contextLabel}.`;
    case 'form_friction':
      return `Input correction pressure is high in ${contextLabel}.`;
    case 'focus_switch_cost':
      return `Switching attention or modality is costly in ${contextLabel}.`;
    case 'information_scent':
      return `Navigation cues are not clearly signaling where to go next in ${contextLabel}.`;
    case 'practice_curve':
      return `A stable operating habit is emerging in ${contextLabel}.`;
    default:
      return `${humanizeConceptKey(finding.conceptKey)} is repeatedly observed in ${contextLabel}.`;
  }
}

function buildAdaptationRecommendation(finding: BehaviorFinding): string {
  const hintedRecommendation = asNonEmptyString(finding.payload.hints);
  if (hintedRecommendation) {
    return hintedRecommendation.endsWith('.') ? hintedRecommendation : `${hintedRecommendation}.`;
  }

  switch (finding.analyzerId) {
    case 'rework_friction':
      return 'Simplify the flow, strengthen defaults, and make edit consequences clearer before submission.';
    case 'error_recovery_cost':
      return 'Shorten the recovery path, preserve user input, and expose the next safe action inline.';
    case 'lostness_light':
      return 'Strengthen orientation cues, shorten navigation branches, and keep local context visible.';
    case 'hick_hyman':
      return 'Reduce simultaneous options, group them more clearly, or stage them progressively.';
    case 'klm_light':
      return 'Cut steps, reduce modality switching, and collapse multi-action flows.';
    case 'fitts_law':
      return 'Enlarge primary targets, reduce pointer travel, and place key actions closer to the working area.';
    case 'steering_law':
      return 'Widen drop targets, simplify drag paths, or replace drag with direct actions.';
    case 'form_friction':
      return 'Shorten forms, prefill where possible, and add inline validation or clearer field grouping.';
    case 'focus_switch_cost':
      return 'Keep related actions together and avoid unnecessary pointer-keyboard switching.';
    case 'information_scent':
      return 'Clarify labels, expose hierarchy, and tighten the link between controls and outcomes.';
    case 'practice_curve':
      return 'Preserve the successful sequence and avoid redesigns that break the learned path.';
    default:
      return 'Adapt the interface to reduce the measured interaction cost without overriding explicit user intent.';
  }
}

function extractBehaviorMetrics(finding: BehaviorFinding): BehaviorEvidenceMetric[] {
  const excludedKeys = new Set([
    'category',
    'contextArchetype',
    'hints',
    'sequence',
    'statement',
    'title',
    'useCases',
  ]);
  const metrics: BehaviorEvidenceMetric[] = [];

  for (const [key, value] of Object.entries(finding.payload)) {
    if (excludedKeys.has(key)) {
      continue;
    }
    if (typeof value === 'number') {
      metrics.push({
        label: key,
        value: formatMetricValue(key, value),
      });
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      metrics.push({
        label: key,
        value: value.trim(),
      });
    }
    if (metrics.length >= 3) {
      break;
    }
  }

  return metrics;
}

function formatMetricValue(key: string, value: number): string {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  if (key.toLowerCase().includes('rate') || key.toLowerCase().includes('pressure')) {
    return `${Math.round(value * 100)}%`;
  }
  if (Math.abs(value) >= 100) {
    return Math.round(value).toString();
  }
  return value.toFixed(2).replace(/\.00$/, '');
}

function computeContextScore(
  finding: BehaviorFinding,
  taskClass: string | undefined,
): number {
  if (!taskClass) {
    return finding.scopeKey ? 0.5 : 0.35;
  }

  const normalizedTaskClass = normalizeKey(taskClass);
  const normalizedScope = normalizeKey(finding.scopeKey);
  const normalizedContext = normalizeKey(asNonEmptyString(finding.payload.contextArchetype));
  const normalizedConcept = normalizeKey(finding.conceptKey);

  if (normalizedScope.endsWith(normalizedTaskClass) || normalizedContext === normalizedTaskClass) {
    return 1;
  }
  if (normalizedConcept.includes(normalizedTaskClass)) {
    return 0.75;
  }
  return finding.scopeKey ? 0.15 : 0.35;
}

function describeFindingContext(finding: BehaviorFinding): string {
  const contextArchetype = asNonEmptyString(finding.payload.contextArchetype);
  if (contextArchetype) {
    return humanizeConceptKey(contextArchetype);
  }
  if (finding.scopeKey?.startsWith('context:')) {
    return humanizeConceptKey(finding.scopeKey.slice('context:'.length));
  }
  return humanizeConceptKey(finding.conceptKey);
}

function humanizeConceptKey(value: string): string {
  return value
    .split(/[:_\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function normalizeKey(value: string | undefined): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function severityToScore(severity: BehaviorFindingSeverity | undefined): number {
  switch (severity) {
    case 'high':
      return 1;
    case 'medium':
      return 0.6;
    case 'low':
    default:
      return 0.25;
  }
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}
