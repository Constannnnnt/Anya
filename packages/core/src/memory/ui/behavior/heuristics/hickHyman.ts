import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { groupSummariesByContext } from './grouping';

export function createHickHymanAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'hick_hyman',
    dependencies: ['session_summaries', 'aggregates'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSummariesByContext(input.sessionSummaries);
      for (const [contextArchetype, summaries] of byContext) {
        const supported = summaries.filter((summary) => (summary.aggregateMetrics.avg_choice_set_size ?? 0) >= 6);
        if (supported.length === 0) continue;
        const avgChoiceSetSize = average(summaries.map((summary) => summary.aggregateMetrics.avg_choice_set_size ?? 0));
        const avgChoiceBits = avgChoiceSetSize > 0 ? Math.log2(avgChoiceSetSize + 1) : 0;
        const avgRetryRate = average(summaries.map((summary) => summary.aggregateMetrics.retry_rate ?? 0));
        const confidence = clamp(0.45 + Math.min(0.25, avgChoiceBits / 6) + avgRetryRate * 0.5 + Math.min(0.1, supported.length * 0.03), 0.45, 0.9);
        const severity = severityFromThresholdPairs([
          { value: avgChoiceBits, high: 3.2, medium: 2.5 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'hick_hyman',
          kind: 'reflection_candidate',
          conceptKey: `choice-overload:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support: supported.length,
          severity,
          evidenceRefs: summaries.map((summary) => summary.id),
          payload: {
            contextArchetype,
            avgChoiceSetSize,
            avgChoiceBits,
            avgRetryRate,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
