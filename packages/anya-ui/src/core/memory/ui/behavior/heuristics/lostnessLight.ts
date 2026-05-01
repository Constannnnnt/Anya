import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { countOscillation, countRevisits, groupNavigationSessionsByContext, groupSignalsBySessionAndContext } from './grouping';

export function createLostnessLightAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'lostness_light',
    dependencies: ['signals', 'aggregates'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    minContextArchetypes: 1,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const navigationSignals = input.signals.filter((signal) => signal.actionFamily === 'navigation');
      const sessions = groupSignalsBySessionAndContext(navigationSignals);
      for (const [contextArchetype, sessionGroups] of groupNavigationSessionsByContext(sessions)) {
        const metrics = sessionGroups.map(({ signals }) => {
          const path = signals.map((signal) => signal.viewId ?? 'unknown');
          const revisitCount = countRevisits(path);
          const oscillationCount = countOscillation(path);
          return {
            revisitRate: path.length === 0 ? 0 : revisitCount / path.length,
            oscillationRate: path.length <= 2 ? 0 : oscillationCount / (path.length - 2),
          };
        });
        const support = metrics.filter((metric) => metric.revisitRate >= 0.25 || metric.oscillationRate >= 0.15).length;
        if (support === 0) continue;
        const avgRevisitRate = average(metrics.map((metric) => metric.revisitRate));
        const avgOscillationRate = average(metrics.map((metric) => metric.oscillationRate));
        const confidence = clamp(0.45 + avgRevisitRate * 0.8 + avgOscillationRate * 0.8 + Math.min(0.1, support * 0.04), 0.45, 0.95);
        const severity = severityFromThresholdPairs([
          { value: avgRevisitRate, high: 0.5, medium: 0.35 },
          { value: avgOscillationRate, high: 0.3, medium: 0.2 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'lostness_light',
          kind: 'reflection_candidate',
          conceptKey: `lostness-light:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: sessionGroups.flatMap((group) => group.signals.map((signal) => signal.id)),
          payload: {
            contextArchetype,
            avgRevisitRate,
            avgOscillationRate,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
