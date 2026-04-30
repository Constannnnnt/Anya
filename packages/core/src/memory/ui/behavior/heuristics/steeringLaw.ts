import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { groupSignalsByContext } from './grouping';

export function createSteeringLawAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'steering_law',
    dependencies: ['signals', 'session_summaries'],
    cadence: 'rollup',
    minInteractions: 3,
    minSessions: 1,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(
        input.signals.filter((s) =>
          s.actionFamily === 'drag'
          && typeof s.pathLengthPx === 'number'
          && typeof s.pathWidthPx === 'number'
          && s.pathWidthPx! > 0
        ),
      );
      for (const [ctx, signals] of byContext) {
        const ratios = signals.map((s) => s.pathLengthPx! / s.pathWidthPx!);
        const avgPathRatio = average(ratios);
        const avgDragDistance = average(signals.map((s) => s.dragDistancePx ?? 0));
        const support = signals.filter((s) => s.pathLengthPx! / s.pathWidthPx! >= 12).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.3, avgPathRatio / 25) + Math.min(0.1, avgDragDistance / 800) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromThresholdPairs([{ value: avgPathRatio, high: 18, medium: 12 }]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId, analyzerId: 'steering_law', kind: 'reflection_candidate',
          conceptKey: `path-constrained-drag-difficulty:${ctx}`, scopeKey: `context:${ctx}`,
          confidence, support, severity, evidenceRefs: signals.map((s) => s.id),
          payload: { contextArchetype: ctx, avgPathRatio, avgDragDistance },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
