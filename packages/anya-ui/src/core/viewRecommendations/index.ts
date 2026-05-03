import { nextGeneratedId } from '../id';
import type {
  AgentMessage,
  PromptOptions,
  ViewMetadata,
  ViewOrigin,
} from '../types';
import type {
  BehaviorComposite,
  BehaviorFinding,
  BehaviorFindingSeverity,
} from '../memory/ui/behavior';
import {
  getCompositeKindForAnalyzer,
  recordAppliedRecommendation,
  RECOMMENDATION_OUTCOME_ANALYZER_ID,
  resolveFindingContextArchetype,
  type AppliedRecommendation,
} from '../memory/ui/behavior';
import type { BehaviorStore } from '../memory/ui/behavior/store';
import type { FindingInterpreterPolicy } from '../memory/ui/behavior/policy';
import { shouldRetainForLocalAdaptation } from '../memory/ui/behavior/policy';
import { severityToScore } from '../memory/ui/behavior/severity';
import {
  buildBehaviorAdaptationCandidate,
  dedupeFindings,
  type BehaviorEvidenceMetric,
} from '../memory/ui/retrieval';

export interface ViewRecommendationTarget {
  viewId?: string;
  viewKind?: ViewOrigin;
  templateId?: string;
  workflow?: string;
}

export interface ViewRecommendation {
  id: string;
  analyzer: string;
  priority: number;
  score: number;
  severity: BehaviorFindingSeverity;
  confidence: number;
  support: number;
  summary: string;
  recommendation: string;
  evidence: BehaviorEvidenceMetric[];
  target: ViewRecommendationTarget;
  scope?: string;
}

export interface ViewRecommendationQuery {
  view?: ViewMetadata;
  workflow?: string;
  limit?: number;
}

export interface ViewRecommendationRanking {
  max?: number;
  confidenceWeight?: number;
  recencyWeight?: number;
  supportWeight?: number;
  severityWeight?: number;
  contextWeight?: number;
  /** Boost a recommendation by the score of the composite it contributes to. */
  compositeWeight?: number;
  /** Boost or penalty applied based on prior outcome for the same analyzer+context. */
  outcomeWeight?: number;
}

export interface ViewRecommendationEngineConfig {
  actorId: string;
  behaviorStore: BehaviorStore;
  policy: FindingInterpreterPolicy;
  ranking?: ViewRecommendationRanking;
}

export interface BuildViewRecommendationUpdateRequestInput {
  recommendation: ViewRecommendation;
  view?: ViewMetadata;
  promptOptions?: PromptOptions;
  additionalInstructions?: string;
  now?: number;
}

export interface ViewRecommendationUpdateRequest {
  userIntent: string;
  message: AgentMessage;
  promptOptions: PromptOptions;
  currentViewId?: string;
}

interface ScoredViewRecommendation extends ViewRecommendation {
  createdTs: number;
  contextScore: number;
  compositeScore: number;
  outcomeBias: number;
}

interface RequiredViewRecommendationRanking {
  max: number;
  confidenceWeight: number;
  recencyWeight: number;
  supportWeight: number;
  severityWeight: number;
  contextWeight: number;
  compositeWeight: number;
  outcomeWeight: number;
}

export class ViewRecommendationEngine {
  private readonly actorId: string;
  private readonly behaviorStore: BehaviorStore;
  private readonly policy: FindingInterpreterPolicy;
  private readonly ranking: RequiredViewRecommendationRanking;

  constructor(config: ViewRecommendationEngineConfig) {
    this.actorId = config.actorId;
    this.behaviorStore = config.behaviorStore;
    this.policy = config.policy;
    this.ranking = {
      max: config.ranking?.max ?? 4,
      confidenceWeight: config.ranking?.confidenceWeight ?? 0.45,
      recencyWeight: config.ranking?.recencyWeight ?? 0.30,
      supportWeight: config.ranking?.supportWeight ?? 0.25,
      severityWeight: config.ranking?.severityWeight ?? 0.20,
      contextWeight: config.ranking?.contextWeight ?? 0.20,
      compositeWeight: config.ranking?.compositeWeight ?? 0.30,
      outcomeWeight: config.ranking?.outcomeWeight ?? 0.25,
    };
  }

  async list(query?: ViewRecommendationQuery): Promise<ViewRecommendation[]> {
    const [findings, composites] = await Promise.all([
      this.behaviorStore.findFindings(this.actorId),
      this.behaviorStore.findComposites(this.actorId),
    ]);

    const outcomeFindings = findings.filter(
      (finding) => finding.analyzerId === RECOMMENDATION_OUTCOME_ANALYZER_ID,
    );

    const retained = dedupeFindings(
      findings.filter(
        (finding) =>
          finding.analyzerId !== RECOMMENDATION_OUTCOME_ANALYZER_ID
          && shouldRetainForLocalAdaptation(this.policy, finding),
      ),
    );

    if (retained.length === 0) {
      return [];
    }

    const workflow = normalizeWorkflow(query?.workflow ?? query?.view?.workflow);
    const limit = normalizeLimit(query?.limit, this.ranking.max);
    const target = toViewRecommendationTarget(query);

    return rankViewRecommendations(
      retained.map((finding) => {
        const candidate = buildBehaviorAdaptationCandidate(finding, workflow);
        return {
          id: candidate.findingId,
          analyzer: candidate.analyzerId,
          priority: 0,
          score: 0,
          severity: candidate.severity,
          confidence: candidate.confidence,
          support: candidate.support,
          summary: candidate.summary,
          recommendation: candidate.recommendation,
          evidence: candidate.metrics.map((metric) => ({ ...metric })),
          target,
          scope: candidate.scopeKey,
          createdTs: candidate.createdTs,
          contextScore: candidate.contextScore,
          compositeScore: lookupCompositeScore(finding, composites),
          outcomeBias: lookupOutcomeBias(finding, outcomeFindings),
        } satisfies ScoredViewRecommendation;
      }),
      this.ranking,
    ).slice(0, limit);
  }

  forView(
    view: ViewMetadata,
    query?: Omit<ViewRecommendationQuery, 'view'>,
  ): Promise<ViewRecommendation[]> {
    return this.list({
      ...query,
      view,
    });
  }

  /**
   * Mark a recommendation as applied so the outcome reducer can later
   * attribute follow-up sessions to it. Captures the current composite
   * score for the relevant (kind, contextArchetype) as the baseline.
   */
  recordApplication(input: {
    recommendation: ViewRecommendation;
    contextArchetype: string;
    appliedSessionId?: string;
    now?: number;
  }): Promise<AppliedRecommendation> {
    return recordAppliedRecommendation({
      store: this.behaviorStore,
      actorId: this.actorId,
      recommendation: input.recommendation,
      contextArchetype: input.contextArchetype,
      appliedSessionId: input.appliedSessionId,
      now: input.now,
    });
  }
}

export function buildViewRecommendationUpdateRequest(
  input: BuildViewRecommendationUpdateRequestInput,
): ViewRecommendationUpdateRequest {
  const now = input.now ?? Date.now();
  const userIntent = buildUpdateUserIntent(input.recommendation, input.view);
  const promptOptions = buildPromptOptions(input);

  return {
    userIntent,
    currentViewId: input.view?.id ?? input.recommendation.target.viewId,
    promptOptions,
    message: {
      id: nextGeneratedId('msg'),
      role: 'user',
      content: buildUpdateMessage(input.recommendation, input.view),
      timestamp: now,
    },
  };
}

function buildUpdateUserIntent(
  recommendation: ViewRecommendation,
  view?: ViewMetadata,
): string {
  const workflow = view?.workflow ?? recommendation.target.workflow;
  const scope = workflow ? ` in ${workflow}` : '';
  return `Revise the current view${scope} to address: ${normalizeSentence(recommendation.summary)}`;
}

function buildPromptOptions(
  input: BuildViewRecommendationUpdateRequestInput,
): PromptOptions {
  const base = input.promptOptions ?? {};
  const additionalInstructions = [
    'Treat the currently rendered view as the baseline.',
    'Produce an updated view that directly addresses the supplied view recommendation.',
    'Prefer an incremental revision over a full redesign unless the recommendation clearly requires a structural change.',
    'Preserve working interactions, data bindings, and workflow intent when possible.',
    input.additionalInstructions?.trim(),
  ]
    .filter((value): value is string => Boolean(value))
    .join('\n');

  return {
    ...base,
    additionalInstructions,
  };
}

function buildUpdateMessage(
  recommendation: ViewRecommendation,
  view?: ViewMetadata,
): string {
  const lines: string[] = [
    'Revise the current view using the recommendation below.',
    '',
    '## Target View',
    `- view_id: ${view?.id ?? recommendation.target.viewId ?? 'current'}`,
    `- view_kind: ${view?.kind ?? recommendation.target.viewKind ?? 'generated'}`,
  ];

  const templateId = view?.templateId ?? recommendation.target.templateId;
  if (templateId) {
    lines.push(`- template_id: ${templateId}`);
  }

  const workflow = view?.workflow ?? recommendation.target.workflow;
  if (workflow) {
    lines.push(`- workflow: ${workflow}`);
  }

  lines.push(
    '',
    '## Recommendation',
    `- priority: ${recommendation.priority}`,
    `- severity: ${recommendation.severity}`,
    `- confidence: ${recommendation.confidence.toFixed(2)}`,
    `- support: ${recommendation.support}`,
    `- summary: ${normalizeSentence(recommendation.summary)}`,
    `- action: ${normalizeSentence(recommendation.recommendation)}`,
  );

  if (recommendation.evidence.length > 0) {
    lines.push('', '## Evidence');
    for (const evidence of recommendation.evidence) {
      lines.push(`- ${evidence.label}: ${evidence.value}`);
    }
  }

  lines.push(
    '',
    '## Constraints',
    '- Keep the same task and workflow unless the recommendation clearly requires a stronger restructure.',
    '- Preserve valid interactions and bindings whenever they still fit the revised view.',
    '- Return a complete updated view spec.',
  );

  return lines.join('\n');
}

function toViewRecommendationTarget(
  query?: ViewRecommendationQuery,
): ViewRecommendationTarget {
  return {
    viewId: query?.view?.id,
    viewKind: query?.view?.kind,
    templateId: query?.view?.templateId,
    workflow: query?.workflow ?? query?.view?.workflow,
  };
}

function normalizeWorkflow(workflow?: string): string | undefined {
  return typeof workflow === 'string' && workflow.trim().length > 0
    ? workflow.trim()
    : undefined;
}

function normalizeLimit(limit: number | undefined, fallback: number): number {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    return fallback;
  }
  return Math.max(1, Math.floor(limit));
}

function rankViewRecommendations(
  recommendations: ScoredViewRecommendation[],
  ranking: RequiredViewRecommendationRanking,
): ViewRecommendation[] {
  if (recommendations.length === 0) {
    return [];
  }

  const maxTs = Math.max(...recommendations.map((recommendation) => recommendation.createdTs));
  const minTs = Math.min(...recommendations.map((recommendation) => recommendation.createdTs));
  const tsRange = maxTs - minTs || 1;
  const maxSupport = Math.max(...recommendations.map((recommendation) => recommendation.support));

  return recommendations
    .map((recommendation) => ({
      ...recommendation,
      score:
        ranking.confidenceWeight * recommendation.confidence +
        ranking.recencyWeight * ((recommendation.createdTs - minTs) / tsRange) +
        ranking.supportWeight * (maxSupport > 0 ? recommendation.support / maxSupport : 0) +
        ranking.severityWeight * severityToScore(recommendation.severity) +
        ranking.contextWeight * recommendation.contextScore +
        ranking.compositeWeight * recommendation.compositeScore +
        ranking.outcomeWeight * recommendation.outcomeBias,
    }))
    .sort((left, right) => right.score - left.score)
    .map(
      (
        {
          createdTs: _createdTs,
          contextScore: _contextScore,
          compositeScore: _compositeScore,
          outcomeBias: _outcomeBias,
          ...recommendation
        },
        index,
      ) => ({
        ...recommendation,
        priority: index + 1,
      }),
    );
}

function lookupOutcomeBias(
  finding: BehaviorFinding,
  outcomeFindings: BehaviorFinding[],
): number {
  const contextArchetype = resolveFindingContextArchetype(finding);
  if (!contextArchetype) return 0;

  const matches = outcomeFindings.filter((outcome) => {
    const sourceAnalyzer = outcome.payload?.sourceAnalyzer;
    const outcomeContext = outcome.payload?.contextArchetype;
    return sourceAnalyzer === finding.analyzerId
      && typeof outcomeContext === 'string'
      && outcomeContext === contextArchetype;
  });

  if (matches.length === 0) return 0;

  const newest = matches.reduce(
    (best, current) => (current.createdTs > best.createdTs ? current : best),
    matches[0],
  );
  switch (newest.payload?.outcome) {
    case 'improved':
      return 1;
    case 'regressed':
      return -1;
    case 'neutral':
      return -0.5;
    case 'inconclusive':
    default:
      return 0;
  }
}

function lookupCompositeScore(
  finding: BehaviorFinding,
  composites: BehaviorComposite[],
): number {
  const compositeKind = getCompositeKindForAnalyzer(finding.analyzerId);
  if (!compositeKind) return 0;
  const contextArchetype = resolveFindingContextArchetype(finding);
  if (!contextArchetype) return 0;
  const match = composites.find((composite) =>
    composite.kind === compositeKind && composite.contextArchetype === contextArchetype,
  );
  return match?.score ?? 0;
}

function normalizeSentence(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }
  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}
