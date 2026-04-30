import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { groupSummariesByContext } from './grouping';

export function createReworkFrictionAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'rework_friction',
    dependencies: ['segments', 'session_summaries'],
    cadence: 'checkpoint',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSummariesByContext(input.sessionSummaries);
      for (const [contextArchetype, summaries] of byContext) {
        const retryRates = summaries.map((summary) => summary.aggregateMetrics.retry_rate ?? 0);
        const failureRates = summaries.map((summary) => summary.aggregateMetrics.failure_rate ?? 0);
        const support = summaries.filter((summary) => (summary.aggregateMetrics.retry_rate ?? 0) >= 0.15 || (summary.aggregateMetrics.failure_rate ?? 0) >= 0.1).length;
        if (support === 0) continue;
        const avgRetryRate = average(retryRates);
        const avgFailureRate = average(failureRates);
        const confidence = clamp(0.45 + avgRetryRate * 1.5 + avgFailureRate + Math.min(0.12, support * 0.03), 0.45, 0.95);
        const severity = severityFromThresholdPairs([
          { value: avgRetryRate, high: 0.35, medium: 0.2 },
          { value: avgFailureRate, high: 0.25, medium: 0.15 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'rework_friction',
          kind: 'reflection_candidate',
          conceptKey: `rework-friction:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: summaries.map((summary) => summary.id),
          payload: {
            contextArchetype,
            avgRetryRate,
            avgFailureRate,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
