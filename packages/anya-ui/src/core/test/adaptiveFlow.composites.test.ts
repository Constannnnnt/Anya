import { describe, expect, it } from 'vitest';
import { createAnyaRuntime } from '../kernel';
import { createRuntimeEvent } from '../runtime';
import { createFittsLawAnalyzer } from '../memory/ui/behavior/heuristics/fittsLaw';
import {
  POST_APPLICATION_SESSIONS,
  RECOMMENDATION_OUTCOME_ANALYZER_ID,
} from '../memory/ui/behavior/outcomes';

function dispatchFittsBatch(
  runtime: ReturnType<typeof createAnyaRuntime>,
  count: number,
  sessionTag?: string,
) {
  for (let i = 0; i < count; i += 1) {
    runtime.runtime.dispatch(
      createRuntimeEvent(
        'interaction.measured',
        {
          interactionEventId: `${sessionTag ?? 'evt'}-${i}`,
          nodeId: 'small-btn',
          nodeType: 'Button',
          action: 'click',
          measurement: {
            modality: 'pointer',
            targetWidthPx: 10,
            travelPx: 500,
          },
        },
        { source: 'user' },
      ),
    );
  }
}

describe('Adaptive Flow — composites + outcomes', () => {
  it('builds a motor_friction composite from fitts findings during analysis', async () => {
    const analyzer = createFittsLawAnalyzer();
    analyzer.minSessions = 1;
    analyzer.minInteractions = 1;

    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: { enabled: true, analyzers: [analyzer] },
      },
    });

    dispatchFittsBatch(runtime, 5);
    await runtime.uiBehaviorPipeline!.flush('sync');

    const composites = await runtime.uiBehaviorStore!.findComposites('test-user');
    expect(composites.length).toBeGreaterThan(0);
    const motor = composites.find((c) => c.kind === 'motor_friction');
    expect(motor).toBeDefined();
    expect(motor!.score).toBeGreaterThan(0);
    expect(motor!.contributingAnalyzers).toContain('fitts_law');
  });

  it('emits a recommendationOutcome finding once enough post-application sessions accumulate', async () => {
    const analyzer = createFittsLawAnalyzer();
    analyzer.minSessions = 1;
    analyzer.minInteractions = 1;

    const runtime = createAnyaRuntime({
      uiMemory: {
        enabled: true,
        actorId: 'test-user',
        behavior: { enabled: true, analyzers: [analyzer] },
      },
    });

    // 1) Generate baseline interactions and flush to produce composites.
    dispatchFittsBatch(runtime, 5, 'baseline');
    await runtime.uiBehaviorPipeline!.flush('sync');

    const baselineComposite = (await runtime.uiBehaviorStore!.findComposites('test-user'))
      .find((c) => c.kind === 'motor_friction');
    expect(baselineComposite).toBeDefined();

    // 2) Record the application of a recommendation against the current composite baseline.
    const findings = await runtime.uiBehaviorStore!.findFindings('test-user');
    const fittsFinding = findings.find((f) => f.analyzerId === 'fitts_law')!;
    expect(fittsFinding).toBeDefined();

    const appliedTs = Date.now();
    await runtime.uiBehaviorStore!.upsertAppliedRecommendations([
      {
        id: 'arec-1',
        actorId: 'test-user',
        recommendationId: fittsFinding.id,
        analyzerId: 'fitts_law',
        compositeKind: 'motor_friction',
        contextArchetype: baselineComposite!.contextArchetype,
        baselineScore: baselineComposite!.score,
        baselineSeverity: baselineComposite!.severity,
        appliedTs,
      },
    ]);

    // 3) Inject post-application session summaries so the outcome reducer has
    //    enough attribution data. We synthesize them directly because each
    //    real session would otherwise need a full event stream.
    const summaries = Array.from({ length: POST_APPLICATION_SESSIONS }, (_, i) => ({
      id: `bsum:test-user:post-${i}:${baselineComposite!.contextArchetype}`,
      actorId: 'test-user',
      sessionId: `post-${i}`,
      contextArchetype: baselineComposite!.contextArchetype,
      signalCount: 4,
      segmentCount: 1,
      interactionCount: 4,
      aggregateMetrics: {},
      updatedTs: appliedTs + (i + 1) * 1000,
    }));
    await runtime.uiBehaviorStore!.upsertSessionSummaries(summaries);

    // 4) Trigger another flush. Even though no new events were dispatched,
    //    we directly invoke the outcome reducer on the next interaction-driven
    //    pipeline pass, so dispatch one more interaction to force a flush.
    dispatchFittsBatch(runtime, 1, 'post');
    await runtime.uiBehaviorPipeline!.flush('sync');

    // 5) Verify outcome finding emitted and applied record is resolved.
    const outcomeFindings = (await runtime.uiBehaviorStore!.findFindings('test-user'))
      .filter((f) => f.analyzerId === RECOMMENDATION_OUTCOME_ANALYZER_ID);
    expect(outcomeFindings.length).toBeGreaterThan(0);
    expect(outcomeFindings[0].payload.sourceAnalyzer).toBe('fitts_law');
    expect(['improved', 'regressed', 'neutral', 'inconclusive'])
      .toContain(outcomeFindings[0].payload.outcome);

    const open = await runtime.uiBehaviorStore!.findAppliedRecommendations('test-user', { resolved: false });
    expect(open).toHaveLength(0);
    const resolved = await runtime.uiBehaviorStore!.findAppliedRecommendations('test-user', { resolved: true });
    expect(resolved).toHaveLength(1);
    expect(resolved[0].outcome).toBeDefined();
  });
});
