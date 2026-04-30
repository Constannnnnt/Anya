import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, computeFittsId, maxSeverity, severityFromThresholdPairs, severityFromUpperBounds } from './math';
import { groupSignalsByContext } from './grouping';

export function createFittsLawAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'fitts_law',
    dependencies: ['signals', 'session_summaries'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(
        input.signals.filter((s) =>
          (s.modality === 'pointer' || s.modality === 'touch')
          && typeof s.targetWidthPx === 'number'
          && typeof s.travelPx === 'number'
        ),
      );
      for (const [ctx, signals] of byContext) {
        const ids = signals.map((s) => computeFittsId(s.travelPx!, s.targetWidthPx!)).filter(Number.isFinite);
        if (ids.length === 0) continue;
        const avgId = average(ids);
        const tpSamples = signals.filter((s) => typeof s.waitMs === 'number' && s.waitMs! > 0)
          .map((s) => computeFittsId(s.travelPx!, s.targetWidthPx!) / (s.waitMs! / 1000));
        const avgTp = tpSamples.length > 0 ? average(tpSamples) : undefined;
        const support = signals.filter((s) =>
          computeFittsId(s.travelPx!, s.targetWidthPx!) >= 3
          || (typeof s.waitMs === 'number' && computeFittsId(s.travelPx!, s.targetWidthPx!) / (s.waitMs / 1000) < 3.5)
        ).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.25, avgId / 6) + (avgTp !== undefined ? Math.min(0.15, Math.max(0, 4 - avgTp) / 2) : 0) + Math.min(0.1, support * 0.02), 0.45, 0.92);
        const severity = maxSeverity(
          severityFromThresholdPairs([{ value: avgId, high: 4.5, medium: 3.2 }]),
          avgTp !== undefined ? severityFromUpperBounds([{ value: avgTp, high: 2.5, medium: 3.5 }]) : 'low',
        );
        findings.push(createBehaviorFinding({
          actorId: input.actorId, analyzerId: 'fitts_law', kind: 'reflection_candidate',
          conceptKey: `target-acquisition-difficulty:${ctx}`, scopeKey: `context:${ctx}`,
          confidence, support, severity, evidenceRefs: signals.map((s) => s.id),
          payload: { contextArchetype: ctx, avgId, avgThroughput: avgTp },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
