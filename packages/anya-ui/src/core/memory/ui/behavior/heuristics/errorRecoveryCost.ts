import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { collectRecoveryTraces, groupRecoveriesByContext, groupSignalsBySession, mostFrequent } from './grouping';

export function createErrorRecoveryCostAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'error_recovery_cost',
    dependencies: ['signals', 'segments'],
    cadence: 'checkpoint',
    minInteractions: 4,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const recoveries = collectRecoveryTraces(input.signals);
      const byContext = groupRecoveriesByContext(recoveries);
      for (const [contextArchetype, traces] of byContext) {
        const support = traces.length;
        if (support === 0) continue;
        const avgRecoverySteps = average(traces.map((trace) => trace.steps));
        const avgRecoveryWaitMs = average(traces.map((trace) => trace.waitMs));
        const confidence = clamp(0.45 + Math.min(0.25, Math.max(0, avgRecoverySteps - 1) * 0.08) + Math.min(0.2, avgRecoveryWaitMs / 2000) + Math.min(0.1, support * 0.03), 0.45, 0.95);
        const severity = severityFromThresholdPairs([
          { value: avgRecoverySteps, high: 3, medium: 2 },
          { value: avgRecoveryWaitMs, high: 1200, medium: 600 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'error_recovery_cost',
          kind: 'reflection_candidate',
          conceptKey: `error-recovery-cost:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: traces.flatMap((trace) => trace.signalIds),
          payload: {
            contextArchetype,
            avgRecoverySteps,
            avgRecoveryWaitMs,
          },
          createdTs: resolveNow(input, config),
        }));

        const topSequence = mostFrequent(traces.map((trace) => trace.sequenceKey));
        if (topSequence && topSequence.count >= 2) {
          findings.push(createBehaviorFinding({
            actorId: input.actorId,
            analyzerId: 'error_recovery_cost',
            kind: 'pattern_candidate',
            conceptKey: `recovery-sequence:${contextArchetype}:${topSequence.value}`,
            scopeKey: `context:${contextArchetype}`,
            confidence: clamp(0.55 + Math.min(0.2, topSequence.count * 0.05), 0.55, 0.9),
            support: topSequence.count,
            severity: 'medium',
            evidenceRefs: traces.filter((trace) => trace.sequenceKey === topSequence.value).flatMap((trace) => trace.signalIds),
            payload: {
              contextArchetype,
              sequenceKey: topSequence.value,
            },
            createdTs: resolveNow(input, config),
          }));
        }
      }
      return { findings };
    },
  };
}
