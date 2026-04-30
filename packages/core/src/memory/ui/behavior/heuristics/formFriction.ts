import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, safeRatio, severityFromThresholdPairs } from './math';
import { groupSignalsByContext } from './grouping';

export function createFormFrictionAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'form_friction',
    dependencies: ['signals', 'session_summaries'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(
        input.signals.filter((s) => s.componentFamily === 'input'),
      );
      for (const [ctx, signals] of byContext) {
        const summaries = input.sessionSummaries.filter((s) => s.contextArchetype === ctx);
        const avgDelta = average(signals.map((s) => s.deltaLength ?? 0));
        const avgValue = average(signals.map((s) => s.valueLength ?? 0));
        const avgRetry = average(summaries.map((s) => s.aggregateMetrics.retry_rate ?? 0));
        const support = signals.filter((s) => (s.deltaLength ?? 0) >= 4).length;
        if (support === 0) continue;
        const correctionPressure = safeRatio(avgDelta, Math.max(avgValue, 1));
        const confidence = clamp(0.45 + Math.min(0.2, correctionPressure) + avgRetry * 0.6 + Math.min(0.1, support * 0.02), 0.45, 0.93);
        const severity = severityFromThresholdPairs([
          { value: correctionPressure, high: 0.8, medium: 0.5 },
          { value: avgRetry, high: 0.25, medium: 0.15 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId, analyzerId: 'form_friction', kind: 'reflection_candidate',
          conceptKey: `form-friction:${ctx}`, scopeKey: `context:${ctx}`,
          confidence, support, severity, evidenceRefs: signals.map((s) => s.id),
          payload: { contextArchetype: ctx, avgDeltaLength: avgDelta, avgValueLength: avgValue, avgRetryRate: avgRetry, correctionPressure },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
