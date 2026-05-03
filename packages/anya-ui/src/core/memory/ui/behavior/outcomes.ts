/**
 * Recommendation Outcome Loop
 *
 * Closes the feedback loop on the heuristic layer:
 *   1. recordAppliedRecommendation()  — captures a baseline composite snapshot
 *      when a recommendation drives a session.
 *   2. reduceRecommendationOutcomes() — runs after composites are computed in
 *      the pipeline. For each open AppliedRecommendation that has accumulated
 *      enough post-application sessions, it compares the current composite
 *      score against the baseline and emits an outcome finding
 *      (improved | regressed | neutral | inconclusive). The applied record
 *      is then marked resolved with its outcome.
 *
 * Design choices (see prior conversation):
 *   - Attribution window:  POST_APPLICATION_SESSIONS = 3 sessions in the same
 *                          contextArchetype after appliedTs.
 *   - Baseline:            captured at recordAppliedRecommendation() time
 *                          from the current composite for that (kind, context).
 *   - Persistence:         outcomes are emitted as BehaviorFindings of kind
 *                          'reflection_candidate' under the synthetic analyzer
 *                          id 'recommendation_outcome', so they flow through
 *                          the existing interpreter into MemoryStore.
 */

import { nextGeneratedId } from '../../../id';
import { createBehaviorFinding, type BehaviorAnalyzerFinding } from './analyzers';
import { getCompositeKindForAnalyzer } from './composites';
import type {
  AppliedRecommendation,
  BehaviorComposite,
  BehaviorSessionSummary,
  RecommendationOutcome,
} from './schemas';
import type { BehaviorStore } from './store';

export const RECOMMENDATION_OUTCOME_ANALYZER_ID = 'recommendation_outcome';
export const POST_APPLICATION_SESSIONS = 3;
export const OUTCOME_DELTA = 0.05;

export interface ViewRecommendationLike {
  id: string;
  analyzer: string;
  scope?: string;
  target?: { workflow?: string };
}

export interface RecordAppliedRecommendationInput {
  store: BehaviorStore;
  actorId: string;
  recommendation: ViewRecommendationLike;
  contextArchetype: string;
  appliedSessionId?: string;
  now?: number;
}

export async function recordAppliedRecommendation(
  input: RecordAppliedRecommendationInput,
): Promise<AppliedRecommendation> {
  const compositeKind = getCompositeKindForAnalyzer(input.recommendation.analyzer);
  const baseline = compositeKind
    ? await findBaselineComposite(input.store, input.actorId, compositeKind, input.contextArchetype)
    : undefined;

  const record: AppliedRecommendation = {
    id: nextGeneratedId('arec'),
    actorId: input.actorId,
    recommendationId: input.recommendation.id,
    analyzerId: input.recommendation.analyzer,
    compositeKind,
    contextArchetype: input.contextArchetype,
    baselineScore: baseline?.score,
    baselineSeverity: baseline?.severity,
    appliedTs: input.now ?? Date.now(),
    appliedSessionId: input.appliedSessionId,
  };

  await input.store.upsertAppliedRecommendations([record]);
  return record;
}

async function findBaselineComposite(
  store: BehaviorStore,
  actorId: string,
  kind: AppliedRecommendation['compositeKind'],
  contextArchetype: string,
): Promise<BehaviorComposite | undefined> {
  if (!kind) return undefined;
  const matches = await store.findComposites(actorId, { kind, contextArchetype, limit: 1 });
  return matches[0];
}

export interface ReduceRecommendationOutcomesInput {
  actorId: string;
  store: BehaviorStore;
  now: number;
}

export interface RecommendationOutcomeReduction {
  findings: BehaviorAnalyzerFinding[];
  resolvedRecords: AppliedRecommendation[];
}

export async function reduceRecommendationOutcomes(
  input: ReduceRecommendationOutcomesInput,
): Promise<RecommendationOutcomeReduction> {
  const open = await input.store.findAppliedRecommendations(input.actorId, { resolved: false });
  if (open.length === 0) {
    return { findings: [], resolvedRecords: [] };
  }

  const composites = await input.store.findComposites(input.actorId);
  const sessionSummaries = await input.store.findSessionSummaries(input.actorId);

  const findings: BehaviorAnalyzerFinding[] = [];
  const resolvedRecords: AppliedRecommendation[] = [];

  for (const record of open) {
    if (!record.compositeKind || record.baselineScore === undefined) {
      continue;
    }

    const postSessions = countPostApplicationSessions(sessionSummaries, record);
    if (postSessions < POST_APPLICATION_SESSIONS) {
      continue;
    }

    const current = composites.find((composite) =>
      composite.kind === record.compositeKind
      && composite.contextArchetype === record.contextArchetype,
    );

    if (!current) {
      const inconclusiveRecord: AppliedRecommendation = {
        ...record,
        resolvedTs: input.now,
        outcome: 'inconclusive',
      };
      resolvedRecords.push(inconclusiveRecord);
      findings.push(buildOutcomeFinding(record, 'inconclusive', undefined, undefined, postSessions, input.now));
      continue;
    }

    const delta = current.score - record.baselineScore;
    const outcome = classifyOutcome(delta);
    const resolved: AppliedRecommendation = {
      ...record,
      resolvedTs: input.now,
      outcome,
      outcomeScore: current.score,
      outcomeDelta: delta,
    };
    resolvedRecords.push(resolved);
    findings.push(buildOutcomeFinding(record, outcome, current.score, delta, postSessions, input.now));
  }

  if (resolvedRecords.length > 0) {
    await input.store.upsertAppliedRecommendations(resolvedRecords);
  }

  return { findings, resolvedRecords };
}

function countPostApplicationSessions(
  sessionSummaries: BehaviorSessionSummary[],
  record: AppliedRecommendation,
): number {
  const seen = new Set<string>();
  for (const summary of sessionSummaries) {
    if (summary.contextArchetype !== record.contextArchetype) continue;
    if (summary.updatedTs <= record.appliedTs) continue;
    if (record.appliedSessionId && summary.sessionId === record.appliedSessionId) continue;
    seen.add(summary.sessionId);
  }
  return seen.size;
}

function classifyOutcome(delta: number): RecommendationOutcome {
  if (delta < -OUTCOME_DELTA) return 'improved';
  if (delta > OUTCOME_DELTA) return 'regressed';
  return 'neutral';
}

function buildOutcomeFinding(
  record: AppliedRecommendation,
  outcome: RecommendationOutcome,
  outcomeScore: number | undefined,
  delta: number | undefined,
  postSessions: number,
  now: number,
): BehaviorAnalyzerFinding {
  return createBehaviorFinding({
    actorId: record.actorId,
    analyzerId: RECOMMENDATION_OUTCOME_ANALYZER_ID,
    kind: 'reflection_candidate',
    conceptKey: `recommendation-outcome:${record.analyzerId}:${record.contextArchetype}:${outcome}`,
    scopeKey: `context:${record.contextArchetype}`,
    confidence: confidenceFromOutcome(outcome, delta),
    support: postSessions,
    severity: severityFromOutcome(outcome),
    evidenceRefs: [record.id, record.recommendationId],
    payload: {
      contextArchetype: record.contextArchetype,
      sourceAnalyzer: record.analyzerId,
      compositeKind: record.compositeKind,
      outcome,
      baselineScore: record.baselineScore,
      outcomeScore,
      delta,
      postSessions,
      title: outcomeTitle(outcome, record),
      hints: outcomeHint(outcome, record),
    },
    createdTs: now,
  });
}

function confidenceFromOutcome(outcome: RecommendationOutcome, delta: number | undefined): number {
  if (outcome === 'inconclusive') return 0.5;
  const magnitude = Math.min(Math.abs(delta ?? 0), 0.5);
  return Math.min(0.95, 0.6 + magnitude);
}

function severityFromOutcome(outcome: RecommendationOutcome): 'low' | 'medium' | 'high' {
  switch (outcome) {
    case 'regressed':
      return 'high';
    case 'improved':
      return 'medium';
    case 'neutral':
    case 'inconclusive':
    default:
      return 'low';
  }
}

function outcomeTitle(outcome: RecommendationOutcome, record: AppliedRecommendation): string {
  const context = humanize(record.contextArchetype);
  const analyzer = humanize(record.analyzerId);
  switch (outcome) {
    case 'improved':
      return `${analyzer} adaptation reduced friction in ${context}`;
    case 'regressed':
      return `${analyzer} adaptation worsened friction in ${context}`;
    case 'neutral':
      return `${analyzer} adaptation had no measurable effect in ${context}`;
    case 'inconclusive':
      return `${analyzer} adaptation outcome could not be measured in ${context}`;
  }
}

function outcomeHint(outcome: RecommendationOutcome, record: AppliedRecommendation): string {
  switch (outcome) {
    case 'improved':
      return `Prefer similar ${humanize(record.analyzerId)} adaptations in ${humanize(record.contextArchetype)}; the prior change reduced measured friction.`;
    case 'regressed':
      return `Avoid repeating the same ${humanize(record.analyzerId)} adaptation in ${humanize(record.contextArchetype)}; the prior change increased measured friction.`;
    case 'neutral':
      return `${humanize(record.analyzerId)} adaptations in ${humanize(record.contextArchetype)} have had no measurable effect; consider a different lever.`;
    case 'inconclusive':
      return `Insufficient post-application data to evaluate ${humanize(record.analyzerId)} adaptation in ${humanize(record.contextArchetype)}.`;
  }
}

function humanize(value: string): string {
  return value
    .split(/[:_\-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
