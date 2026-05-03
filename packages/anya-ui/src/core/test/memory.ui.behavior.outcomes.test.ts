import { describe, expect, it } from 'vitest';
import { InMemoryBehaviorStore } from '../memory/ui/behavior/inMemoryStore';
import {
  POST_APPLICATION_SESSIONS,
  RECOMMENDATION_OUTCOME_ANALYZER_ID,
  recordAppliedRecommendation,
  reduceRecommendationOutcomes,
} from '../memory/ui/behavior/outcomes';
import type {
  BehaviorComposite,
  BehaviorSessionSummary,
  ViewRecommendationLike,
} from '../memory/ui/behavior';

const ACTOR = 'actor-1';
const CONTEXT = 'browse_scan';

function makeComposite(overrides: Partial<BehaviorComposite> = {}): BehaviorComposite {
  return {
    id: `bcomp:${ACTOR}:motor_friction:${CONTEXT}`,
    actorId: ACTOR,
    kind: 'motor_friction',
    contextArchetype: CONTEXT,
    score: 0.8,
    severity: 'high',
    confidence: 0.85,
    support: 5,
    contributingAnalyzers: ['fitts_law'],
    findingIds: ['bf-1'],
    windowStartTs: 100,
    windowEndTs: 200,
    updatedTs: 200,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BehaviorSessionSummary> = {}): BehaviorSessionSummary {
  return {
    id: `bsum:${ACTOR}:s1:${CONTEXT}`,
    actorId: ACTOR,
    sessionId: 's1',
    contextArchetype: CONTEXT,
    signalCount: 5,
    segmentCount: 1,
    interactionCount: 5,
    aggregateMetrics: {},
    updatedTs: 1000,
    ...overrides,
  };
}

const recommendation: ViewRecommendationLike = {
  id: 'bf-fitts',
  analyzer: 'fitts_law',
  scope: 'context:browse_scan',
};

describe('recordAppliedRecommendation', () => {
  it('captures the current composite as baseline', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertComposites([makeComposite({ score: 0.75, severity: 'high' })]);

    const record = await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation,
      contextArchetype: CONTEXT,
      now: 500,
    });

    expect(record.recommendationId).toBe('bf-fitts');
    expect(record.compositeKind).toBe('motor_friction');
    expect(record.baselineScore).toBe(0.75);
    expect(record.baselineSeverity).toBe('high');
    expect(record.appliedTs).toBe(500);
    expect(record.resolvedTs).toBeUndefined();
  });

  it('persists the record so it can be queried back', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertComposites([makeComposite()]);

    await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation,
      contextArchetype: CONTEXT,
      now: 100,
    });

    const open = await store.findAppliedRecommendations(ACTOR, { resolved: false });
    expect(open).toHaveLength(1);
    expect(open[0].recommendationId).toBe('bf-fitts');
  });

  it('skips compositeKind when analyzer does not map to a composite', async () => {
    const store = new InMemoryBehaviorStore();

    const record = await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation: { ...recommendation, analyzer: 'practice_curve' },
      contextArchetype: CONTEXT,
    });

    expect(record.compositeKind).toBeUndefined();
    expect(record.baselineScore).toBeUndefined();
  });

  it('leaves baseline undefined if no matching composite exists yet', async () => {
    const store = new InMemoryBehaviorStore();

    const record = await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation,
      contextArchetype: CONTEXT,
    });

    expect(record.compositeKind).toBe('motor_friction');
    expect(record.baselineScore).toBeUndefined();
  });
});

describe('reduceRecommendationOutcomes', () => {
  async function seed(store: InMemoryBehaviorStore, opts: {
    baseline: number;
    current: number;
    postSessions: number;
    appliedTs?: number;
  }) {
    const appliedTs = opts.appliedTs ?? 500;
    await store.upsertComposites([makeComposite({ score: opts.baseline })]);
    await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation,
      contextArchetype: CONTEXT,
      now: appliedTs,
    });
    // Simulate composite refresh post-application
    await store.upsertComposites([makeComposite({ score: opts.current, updatedTs: appliedTs + 10000 })]);
    // Add post-application session summaries
    const summaries = Array.from({ length: opts.postSessions }, (_, i) => makeSummary({
      id: `bsum:${ACTOR}:post-${i}:${CONTEXT}`,
      sessionId: `post-${i}`,
      updatedTs: appliedTs + (i + 1) * 1000,
    }));
    await store.upsertSessionSummaries(summaries);
  }

  it('emits improved outcome when score drops by more than the delta', async () => {
    const store = new InMemoryBehaviorStore();
    await seed(store, { baseline: 0.8, current: 0.65, postSessions: POST_APPLICATION_SESSIONS });

    const result = await reduceRecommendationOutcomes({
      actorId: ACTOR,
      store,
      now: 999999,
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0].analyzerId).toBe(RECOMMENDATION_OUTCOME_ANALYZER_ID);
    expect(result.findings[0].payload.outcome).toBe('improved');
    expect(result.findings[0].payload.delta).toBeCloseTo(-0.15, 5);
    expect(result.resolvedRecords[0].outcome).toBe('improved');
    expect(result.resolvedRecords[0].resolvedTs).toBe(999999);
  });

  it('emits regressed outcome when score rises by more than the delta', async () => {
    const store = new InMemoryBehaviorStore();
    await seed(store, { baseline: 0.5, current: 0.7, postSessions: POST_APPLICATION_SESSIONS });

    const result = await reduceRecommendationOutcomes({
      actorId: ACTOR,
      store,
      now: 999999,
    });

    expect(result.findings[0].payload.outcome).toBe('regressed');
    expect(result.findings[0].severity).toBe('high');
  });

  it('emits neutral when change is within the delta band', async () => {
    const store = new InMemoryBehaviorStore();
    await seed(store, { baseline: 0.6, current: 0.62, postSessions: POST_APPLICATION_SESSIONS });

    const result = await reduceRecommendationOutcomes({
      actorId: ACTOR,
      store,
      now: 999999,
    });

    expect(result.findings[0].payload.outcome).toBe('neutral');
  });

  it('skips applied records with insufficient post-application sessions', async () => {
    const store = new InMemoryBehaviorStore();
    await seed(store, { baseline: 0.8, current: 0.5, postSessions: POST_APPLICATION_SESSIONS - 1 });

    const result = await reduceRecommendationOutcomes({
      actorId: ACTOR,
      store,
      now: 999999,
    });

    expect(result.findings).toHaveLength(0);
    expect(result.resolvedRecords).toHaveLength(0);
  });

  it('persists resolution so the record is no longer "open"', async () => {
    const store = new InMemoryBehaviorStore();
    await seed(store, { baseline: 0.8, current: 0.5, postSessions: POST_APPLICATION_SESSIONS });

    await reduceRecommendationOutcomes({ actorId: ACTOR, store, now: 999999 });

    const open = await store.findAppliedRecommendations(ACTOR, { resolved: false });
    const resolved = await store.findAppliedRecommendations(ACTOR, { resolved: true });
    expect(open).toHaveLength(0);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].outcome).toBe('improved');
  });

  it('emits inconclusive when the composite is missing post-application', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertComposites([makeComposite({ score: 0.8 })]);
    await recordAppliedRecommendation({
      store,
      actorId: ACTOR,
      recommendation,
      contextArchetype: CONTEXT,
      now: 500,
    });
    // Drop the composite (simulating no further heuristic activity in this context)
    const allComposites = await store.findComposites(ACTOR);
    // Replace with a composite for a different context so the lookup returns nothing
    await store.upsertComposites(allComposites.map((c) => ({ ...c, kind: 'cognitive_load' as const })));
    // Add post-application sessions
    const summaries = Array.from({ length: POST_APPLICATION_SESSIONS }, (_, i) => makeSummary({
      id: `bsum:${ACTOR}:post-${i}:${CONTEXT}`,
      sessionId: `post-${i}`,
      updatedTs: 500 + (i + 1) * 1000,
    }));
    await store.upsertSessionSummaries(summaries);

    const result = await reduceRecommendationOutcomes({ actorId: ACTOR, store, now: 999999 });

    expect(result.findings[0].payload.outcome).toBe('inconclusive');
    expect(result.resolvedRecords[0].outcome).toBe('inconclusive');
  });

  it('does nothing when there are no open applied recommendations', async () => {
    const store = new InMemoryBehaviorStore();
    const result = await reduceRecommendationOutcomes({ actorId: ACTOR, store, now: 1 });
    expect(result.findings).toHaveLength(0);
    expect(result.resolvedRecords).toHaveLength(0);
  });
});
