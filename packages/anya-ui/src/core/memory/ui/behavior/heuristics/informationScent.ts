import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromRequiredThresholds } from './math';
import { countOscillation, countRevisits, groupSignalsByContext, groupSignalsBySessionAndContext } from './grouping';

export function createInformationScentAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'information_scent',
    dependencies: ['signals', 'session_summaries', 'aggregates'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(
        input.signals.filter((s) =>
          s.actionFamily === 'navigation'
          || s.contextArchetype === 'search_filter'
          || s.contextArchetype === 'navigate_drilldown'
        ),
      );
      for (const [ctx, signals] of byContext) {
        const sessions = groupSignalsBySessionAndContext(signals);
        const metrics = sessions.map(({ signals: ss }) => {
          const path = ss.map((s) => s.viewId ?? 'unknown');
          const revisitRate = path.length === 0 ? 0 : countRevisits(path) / path.length;
          const oscillationRate = path.length <= 2 ? 0 : countOscillation(path) / (path.length - 2);
          const avgChoice = average(ss.map((s) => s.choiceSetSize ?? 0));
          return { revisitRate, oscillationRate, avgChoice };
        });
        const support = metrics.filter((m) => m.revisitRate >= 0.2 && m.oscillationRate >= 0.1 && m.avgChoice >= 4).length;
        if (support === 0) continue;
        const avgRevisit = average(metrics.map((m) => m.revisitRate));
        const avgOsc = average(metrics.map((m) => m.oscillationRate));
        const avgChoice = average(metrics.map((m) => m.avgChoice));
        const confidence = clamp(0.45 + avgRevisit * 0.6 + avgOsc * 0.6 + Math.min(0.15, avgChoice / 12) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromRequiredThresholds([
          { value: avgRevisit, high: 0.35, medium: 0.2 },
          { value: avgOsc, high: 0.2, medium: 0.1 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId, analyzerId: 'information_scent', kind: 'reflection_candidate',
          conceptKey: `information-scent:${ctx}`, scopeKey: `context:${ctx}`,
          confidence, support, severity,
          evidenceRefs: sessions.flatMap((s) => s.signals.map((sig) => sig.id)),
          payload: { contextArchetype: ctx, avgRevisitRate: avgRevisit, avgOscillationRate: avgOsc, avgChoice },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
