import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { countModalitySwitches, countSessionRetries, groupSignalsByContext, groupSignalsBySession } from './grouping';

export function createKlmLightAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'klm_light',
    dependencies: ['signals', 'segments', 'session_summaries'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(input.signals);
      for (const [contextArchetype, signals] of byContext) {
        const sessions = groupSignalsBySession(signals);
        const burdens = sessions.map((sessionSignals) => {
          const modalitySwitches = countModalitySwitches(sessionSignals);
          const totalWaitMs = sessionSignals.reduce((sum, signal) => sum + (signal.waitMs ?? 0), 0);
          const retries = countSessionRetries(sessionSignals);
          const burdenScore = sessionSignals.length + 1.2 * modalitySwitches + 1.5 * retries + totalWaitMs / 500;
          return {
            burdenScore,
            modalitySwitches,
            totalWaitMs,
            retries,
          };
        });
        const support = burdens.filter((burden) => burden.burdenScore >= 5).length;
        if (support === 0) continue;
        const avgBurdenScore = average(burdens.map((burden) => burden.burdenScore));
        const avgModalitySwitches = average(burdens.map((burden) => burden.modalitySwitches));
        const avgWaitMs = average(burdens.map((burden) => burden.totalWaitMs));
        const confidence = clamp(0.45 + Math.min(0.25, avgBurdenScore / 12) + Math.min(0.15, avgModalitySwitches * 0.06) + Math.min(0.1, support * 0.03), 0.45, 0.92);
        const severity = severityFromThresholdPairs([
          { value: avgBurdenScore, high: 8, medium: 5.5 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'klm_light',
          kind: 'reflection_candidate',
          conceptKey: `operator-burden:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: signals.map((signal) => signal.id),
          payload: {
            contextArchetype,
            avgBurdenScore,
            avgModalitySwitches,
            avgWaitMs,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
