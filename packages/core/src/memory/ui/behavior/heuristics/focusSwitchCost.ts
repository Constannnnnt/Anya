import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { average, clamp, severityFromThresholdPairs } from './math';
import { countModalitySwitches, groupSignalsByContext, groupSignalsBySession } from './grouping';

export function createFocusSwitchCostAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'focus_switch_cost',
    dependencies: ['signals', 'session_summaries'],
    cadence: 'rollup',
    minInteractions: 4,
    minSessions: 2,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const byContext = groupSignalsByContext(input.signals);
      for (const [ctx, signals] of byContext) {
        const sessions = groupSignalsBySession(signals);
        const switches = sessions.map((ss) => countModalitySwitches(ss));
        const avgSwitches = average(switches);
        const avgFocus = average(signals.map((s) => s.focusMovesSinceLast ?? 0));
        const avgHoming = average(signals.map((s) => s.homingTransitionsSinceLast ?? 0));
        const support = sessions.filter((ss) => countModalitySwitches(ss) >= 2).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.2, avgSwitches * 0.08) + Math.min(0.15, avgFocus * 0.05) + Math.min(0.15, avgHoming * 0.08) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromThresholdPairs([
          { value: avgSwitches, high: 3, medium: 2 },
          { value: avgHoming, high: 1.5, medium: 1 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId, analyzerId: 'focus_switch_cost', kind: 'reflection_candidate',
          conceptKey: `focus-switch-cost:${ctx}`, scopeKey: `context:${ctx}`,
          confidence, support, severity, evidenceRefs: signals.map((s) => s.id),
          payload: { contextArchetype: ctx, avgModalitySwitches: avgSwitches, avgFocusMoves: avgFocus, avgHoming },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}
