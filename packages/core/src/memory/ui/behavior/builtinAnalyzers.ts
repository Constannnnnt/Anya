import {
  createBehaviorFinding,
  type BehaviorAnalyzer,
  type BehaviorAnalyzerFinding,
  type BehaviorAnalyzerInput,
} from './analyzers';
import type { BehaviorSessionSummary, BehaviorSignal } from './schemas';

interface AnalyzerConfig {
  now?: () => number;
}

interface PracticeSample {
  contextArchetype: string;
  sessionId: string;
  updatedTs: number;
  sequenceKey: string;
  burdenScore: number;
  retryCount: number;
  failureRate: number;
  dominantModality: string;
  evidenceRefs: string[];
}

interface RecoveryTrace {
  contextArchetype: string;
  sessionId: string;
  steps: number;
  waitMs: number;
  signalIds: string[];
  sequenceKey: string;
}

export function createBuiltinBehaviorAnalyzers(config?: AnalyzerConfig): BehaviorAnalyzer[] {
  return [
    createReworkFrictionAnalyzer(config),
    createErrorRecoveryCostAnalyzer(config),
    createLostnessLightAnalyzer(config),
    createHickHymanAnalyzer(config),
    createKlmLightAnalyzer(config),
    createPracticeCurveAnalyzer(config),
    createFittsLawAnalyzer(config),
    createSteeringLawAnalyzer(config),
    createFormFrictionAnalyzer(config),
    createFocusSwitchCostAnalyzer(config),
    createInformationScentAnalyzer(config),
  ];
}

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
          const path = signals.map((signal) => signal.uiId ?? 'unknown');
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

export function createPracticeCurveAnalyzer(config?: AnalyzerConfig): BehaviorAnalyzer {
  return {
    id: 'practice_curve',
    dependencies: ['signals', 'session_summaries', 'aggregates'],
    cadence: 'rollup',
    minInteractions: 6,
    minSessions: 3,
    run(input) {
      const findings: BehaviorAnalyzerFinding[] = [];
      const samples = buildPracticeSamples(input.signals, input.sessionSummaries);
      const grouped = groupPracticeSamples(samples);

      for (const [groupKey, flowSamples] of grouped) {
        if (flowSamples.length < 3) continue;
        const sorted = [...flowSamples].sort((left, right) => left.updatedTs - right.updatedTs);
        const burdenImprovement = sorted[0].burdenScore - sorted[sorted.length - 1].burdenScore;
        const retryImprovement = sorted[0].retryCount - sorted[sorted.length - 1].retryCount;
        const failureImprovement = sorted[0].failureRate - sorted[sorted.length - 1].failureRate;
        const improvementSteps = countPracticeImprovements(sorted);
        if (improvementSteps < 2 || burdenImprovement <= 0.75) {
          continue;
        }

        const support = sorted.length;
        const modalityConsistency = dominantSampleConsistency(sorted.map((sample) => sample.dominantModality));
        const confidence = clamp(
          0.5
          + Math.min(0.18, burdenImprovement / 8)
          + Math.min(0.1, improvementSteps * 0.04)
          + Math.min(0.08, modalityConsistency * 0.12)
          + Math.min(0.06, Math.max(0, retryImprovement) * 0.03),
          0.5,
          0.93,
        );
        const evidenceRefs = sorted.flatMap((sample) => sample.evidenceRefs);
        const sequenceKey = sorted[0].sequenceKey;
        const contextArchetype = sorted[0].contextArchetype;

        const dominantModality = mostFrequent(sorted.map((sample) => sample.dominantModality))?.value ?? 'unknown';

        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'practice_curve',
          kind: 'pattern_candidate',
          conceptKey: `practice-sequence:${contextArchetype}:${sequenceKey}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity: 'low',
          evidenceRefs,
          payload: {
            contextArchetype,
            sequenceKey,
            initialBurdenScore: sorted[0].burdenScore,
            finalBurdenScore: sorted[sorted.length - 1].burdenScore,
            burdenImprovement,
            retryImprovement,
            failureImprovement,
            dominantModality,
            groupKey,
          },
          createdTs: resolveNow(input, config),
        }));

        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'practice_curve',
          kind: 'reflection_candidate',
          conceptKey: `practice-curve:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence: clamp(confidence - 0.04, 0.5, 0.9),
          support,
          severity: 'medium',
          evidenceRefs,
          payload: {
            contextArchetype,
            title: `Practice Curve ${humanizeContext(contextArchetype)}`,
            hints: 'Preserve the successful sequence and avoid interface changes that break the learned flow.',
            sequenceKey,
            initialBurdenScore: sorted[0].burdenScore,
            finalBurdenScore: sorted[sorted.length - 1].burdenScore,
            burdenImprovement,
            retryImprovement,
            failureImprovement,
          },
          createdTs: resolveNow(input, config),
        }));
      }

      return { findings };
    },
  };
}

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
        input.signals.filter((signal) =>
          (signal.modality === 'pointer' || signal.modality === 'touch')
          && typeof signal.targetWidthPx === 'number'
          && typeof signal.travelPx === 'number'
        ),
      );
      for (const [contextArchetype, signals] of byContext) {
        const ids = signals
          .map((signal) => computeFittsId(signal.travelPx!, signal.targetWidthPx!))
          .filter((value) => Number.isFinite(value));
        if (ids.length === 0) continue;
        const avgId = average(ids);
        const throughputSamples = signals
          .filter((signal) => typeof signal.waitMs === 'number' && signal.waitMs! > 0)
          .map((signal) => computeFittsId(signal.travelPx!, signal.targetWidthPx!) / (signal.waitMs! / 1000));
        const avgThroughput = throughputSamples.length > 0 ? average(throughputSamples) : undefined;
        const support = signals.filter((signal) =>
          computeFittsId(signal.travelPx!, signal.targetWidthPx!) >= 3
          || (typeof signal.waitMs === 'number' && computeFittsId(signal.travelPx!, signal.targetWidthPx!) / (signal.waitMs / 1000) < 3.5)
        ).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.25, avgId / 6) + (avgThroughput !== undefined ? Math.min(0.15, Math.max(0, 4 - avgThroughput) / 2) : 0) + Math.min(0.1, support * 0.02), 0.45, 0.92);
        const severity = maxSeverity(
          severityFromThresholdPairs([
            { value: avgId, high: 4.5, medium: 3.2 },
          ]),
          avgThroughput !== undefined
            ? severityFromUpperBounds([
              { value: avgThroughput, high: 2.5, medium: 3.5 },
            ])
            : 'low',
        );
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'fitts_law',
          kind: 'reflection_candidate',
          conceptKey: `target-acquisition-difficulty:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: signals.map((signal) => signal.id),
          payload: {
            contextArchetype,
            avgId,
            avgThroughput,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}

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
        input.signals.filter((signal) =>
          signal.actionFamily === 'drag'
          && typeof signal.pathLengthPx === 'number'
          && typeof signal.pathWidthPx === 'number'
          && signal.pathWidthPx! > 0
        ),
      );
      for (const [contextArchetype, signals] of byContext) {
        const ratios = signals.map((signal) => signal.pathLengthPx! / signal.pathWidthPx!);
        const avgPathRatio = average(ratios);
        const avgDragDistance = average(signals.map((signal) => signal.dragDistancePx ?? 0));
        const support = signals.filter((signal) => signal.pathLengthPx! / signal.pathWidthPx! >= 12).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.3, avgPathRatio / 25) + Math.min(0.1, avgDragDistance / 800) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromThresholdPairs([
          { value: avgPathRatio, high: 18, medium: 12 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'steering_law',
          kind: 'reflection_candidate',
          conceptKey: `path-constrained-drag-difficulty:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: signals.map((signal) => signal.id),
          payload: {
            contextArchetype,
            avgPathRatio,
            avgDragDistance,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}

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
        input.signals.filter((signal) => signal.componentFamily === 'input'),
      );
      for (const [contextArchetype, signals] of byContext) {
        const summaries = input.sessionSummaries.filter((summary) => summary.contextArchetype === contextArchetype);
        const avgDeltaLength = average(signals.map((signal) => signal.deltaLength ?? 0));
        const avgValueLength = average(signals.map((signal) => signal.valueLength ?? 0));
        const avgRetryRate = average(summaries.map((summary) => summary.aggregateMetrics.retry_rate ?? 0));
        const support = signals.filter((signal) => (signal.deltaLength ?? 0) >= 4).length;
        if (support === 0) continue;
        const correctionPressure = safeRatio(avgDeltaLength, Math.max(avgValueLength, 1));
        const confidence = clamp(0.45 + Math.min(0.2, correctionPressure) + avgRetryRate * 0.6 + Math.min(0.1, support * 0.02), 0.45, 0.93);
        const severity = severityFromThresholdPairs([
          { value: correctionPressure, high: 0.8, medium: 0.5 },
          { value: avgRetryRate, high: 0.25, medium: 0.15 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'form_friction',
          kind: 'reflection_candidate',
          conceptKey: `form-friction:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: signals.map((signal) => signal.id),
          payload: {
            contextArchetype,
            avgDeltaLength,
            avgValueLength,
            avgRetryRate,
            correctionPressure,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}

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
      for (const [contextArchetype, signals] of byContext) {
        const sessions = groupSignalsBySession(signals);
        const modalitySwitches = sessions.map((sessionSignals) => countModalitySwitches(sessionSignals));
        const avgModalitySwitches = average(modalitySwitches);
        const avgFocusMoves = average(signals.map((signal) => signal.focusMovesSinceLast ?? 0));
        const avgHoming = average(signals.map((signal) => signal.homingTransitionsSinceLast ?? 0));
        const support = sessions.filter((sessionSignals) => countModalitySwitches(sessionSignals) >= 2).length;
        if (support === 0) continue;
        const confidence = clamp(0.45 + Math.min(0.2, avgModalitySwitches * 0.08) + Math.min(0.15, avgFocusMoves * 0.05) + Math.min(0.15, avgHoming * 0.08) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromThresholdPairs([
          { value: avgModalitySwitches, high: 3, medium: 2 },
          { value: avgHoming, high: 1.5, medium: 1 },
        ]);
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'focus_switch_cost',
          kind: 'reflection_candidate',
          conceptKey: `focus-switch-cost:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: signals.map((signal) => signal.id),
          payload: {
            contextArchetype,
            avgModalitySwitches,
            avgFocusMoves,
            avgHoming,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}

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
        input.signals.filter((signal) =>
          signal.actionFamily === 'navigation'
          || signal.contextArchetype === 'search_filter'
          || signal.contextArchetype === 'navigate_drilldown'
        ),
      );
      for (const [contextArchetype, signals] of byContext) {
        const sessions = groupSignalsBySessionAndContext(signals);
        const metrics = sessions.map(({ signals: sessionSignals }) => {
          const path = sessionSignals.map((signal) => signal.uiId ?? 'unknown');
          const revisitRate = path.length === 0 ? 0 : countRevisits(path) / path.length;
          const oscillationRate = path.length <= 2 ? 0 : countOscillation(path) / (path.length - 2);
          const avgChoice = average(sessionSignals.map((signal) => signal.choiceSetSize ?? 0));
          return { revisitRate, oscillationRate, avgChoice };
        });
        const support = metrics.filter((metric) =>
          metric.revisitRate >= 0.2
          && metric.oscillationRate >= 0.1
          && metric.avgChoice >= 4
        ).length;
        if (support === 0) continue;
        const avgRevisitRate = average(metrics.map((metric) => metric.revisitRate));
        const avgOscillationRate = average(metrics.map((metric) => metric.oscillationRate));
        const avgChoice = average(metrics.map((metric) => metric.avgChoice));
        const confidence = clamp(0.45 + avgRevisitRate * 0.6 + avgOscillationRate * 0.6 + Math.min(0.15, avgChoice / 12) + Math.min(0.08, support * 0.02), 0.45, 0.92);
        const severity = severityFromRequiredThresholds(
          [
            { value: avgRevisitRate, high: 0.35, medium: 0.2 },
            { value: avgOscillationRate, high: 0.2, medium: 0.1 },
          ],
        );
        findings.push(createBehaviorFinding({
          actorId: input.actorId,
          analyzerId: 'information_scent',
          kind: 'reflection_candidate',
          conceptKey: `information-scent:${contextArchetype}`,
          scopeKey: `context:${contextArchetype}`,
          confidence,
          support,
          severity,
          evidenceRefs: sessions.flatMap((session) => session.signals.map((signal) => signal.id)),
          payload: {
            contextArchetype,
            avgRevisitRate,
            avgOscillationRate,
            avgChoice,
          },
          createdTs: resolveNow(input, config),
        }));
      }
      return { findings };
    },
  };
}

function groupSummariesByContext(summaries: BehaviorSessionSummary[]): Map<string, BehaviorSessionSummary[]> {
  const groups = new Map<string, BehaviorSessionSummary[]>();
  for (const summary of summaries) {
    pushGroup(groups, summary.contextArchetype, summary);
  }
  return groups;
}

function groupSignalsByContext(signals: BehaviorSignal[]): Map<string, BehaviorSignal[]> {
  const groups = new Map<string, BehaviorSignal[]>();
  for (const signal of signals) {
    pushGroup(groups, signal.contextArchetype, signal);
  }
  return groups;
}

function groupSignalsBySession(signals: BehaviorSignal[]): BehaviorSignal[][] {
  const groups = new Map<string, BehaviorSignal[]>();
  const sorted = [...signals].sort((left, right) => left.ts - right.ts);
  for (const signal of sorted) {
    pushGroup(groups, signal.sessionId, signal);
  }
  return [...groups.values()];
}

function groupSignalsBySessionAndContext(
  signals: BehaviorSignal[],
): Array<{ contextArchetype: string; sessionId: string; signals: BehaviorSignal[] }> {
  const groups = new Map<string, BehaviorSignal[]>();
  for (const signal of [...signals].sort((left, right) => left.ts - right.ts)) {
    pushGroup(groups, `${signal.contextArchetype}::${signal.sessionId}`, signal);
  }
  return [...groups.entries()].map(([key, groupedSignals]) => {
    const separatorIndex = key.indexOf('::');
    return {
      contextArchetype: key.slice(0, separatorIndex),
      sessionId: key.slice(separatorIndex + 2),
      signals: groupedSignals,
    };
  });
}

function groupNavigationSessionsByContext(
  sessions: Array<{ contextArchetype: string; sessionId: string; signals: BehaviorSignal[] }>,
): Map<string, Array<{ sessionId: string; signals: BehaviorSignal[] }>> {
  const groups = new Map<string, Array<{ sessionId: string; signals: BehaviorSignal[] }>>();
  for (const session of sessions) {
    const value = { sessionId: session.sessionId, signals: session.signals };
    pushGroup(groups, session.contextArchetype, value);
  }
  return groups;
}

function buildPracticeSamples(
  signals: BehaviorSignal[],
  sessionSummaries: BehaviorSessionSummary[],
): PracticeSample[] {
  const summaryByKey = new Map(
    sessionSummaries.map((summary) => [
      `${summary.sessionId}::${summary.contextArchetype}`,
      summary,
    ]),
  );

  return groupSignalsBySessionAndContext(signals).map((group) => {
    const summary = summaryByKey.get(`${group.sessionId}::${group.contextArchetype}`);
    const orderedSignals = [...group.signals].sort((left, right) => left.ts - right.ts);
    const interactionSignals = orderedSignals.filter((signal) => signal.sourceEventType === 'interaction.measured');
    const retryCount = countSessionRetries(interactionSignals);
    const avgWaitMs = average(orderedSignals.map((signal) => signal.waitMs ?? 0));
    const failureRate = summary?.aggregateMetrics.failure_rate
      ?? safeRatio(
        orderedSignals.filter((signal) => signal.success === false).length,
        Math.max(orderedSignals.filter((signal) => signal.success !== undefined).length, 1),
      );
    const modalitySwitches = countModalitySwitches(orderedSignals);
    const interactionCount = summary?.interactionCount ?? interactionSignals.length;

    return {
      contextArchetype: group.contextArchetype,
      sessionId: group.sessionId,
      updatedTs: summary?.updatedTs ?? orderedSignals[orderedSignals.length - 1]?.ts ?? 0,
      sequenceKey: buildPracticeSequenceKey(orderedSignals),
      burdenScore: interactionCount
        + retryCount * 1.5
        + modalitySwitches * 1.2
        + avgWaitMs / 500
        + failureRate * 4,
      retryCount,
      failureRate,
      dominantModality: mostFrequent(orderedSignals.map((signal) => signal.modality))?.value ?? 'unknown',
      evidenceRefs: orderedSignals.map((signal) => signal.id),
    };
  });
}

function groupPracticeSamples(
  samples: PracticeSample[],
): Map<string, PracticeSample[]> {
  const groups = new Map<string, PracticeSample[]>();
  for (const sample of samples) {
    pushGroup(groups, `${sample.contextArchetype}::${sample.sequenceKey}`, sample);
  }
  return groups;
}

function buildPracticeSequenceKey(signals: BehaviorSignal[]): string {
  const sequence: string[] = [];
  for (const signal of signals) {
    const actionFamily = signal.actionFamily ?? 'unknown';
    if (sequence[sequence.length - 1] === actionFamily) {
      continue;
    }
    sequence.push(actionFamily);
  }
  return sequence.join(' -> ') || 'direct-flow';
}

function countPracticeImprovements(
  samples: Array<{ burdenScore: number; retryCount: number; failureRate: number }>,
): number {
  let improvements = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const burdenImproved = current.burdenScore < previous.burdenScore;
    const retryImproved = current.retryCount <= previous.retryCount;
    const failureImproved = current.failureRate <= previous.failureRate;
    if (burdenImproved && retryImproved && failureImproved) {
      improvements += 1;
    }
  }
  return improvements;
}

function dominantSampleConsistency(modalities: string[]): number {
  const dominant = mostFrequent(modalities);
  return (dominant?.count ?? 0) / Math.max(modalities.length, 1);
}

function collectRecoveryTraces(signals: BehaviorSignal[]): Array<{
  contextArchetype: string;
  sessionId: string;
  steps: number;
  waitMs: number;
  signalIds: string[];
  sequenceKey: string;
}> {
  const traces: RecoveryTrace[] = [];
  for (const sessionSignals of groupSignalsBySession(signals)) {
    for (let i = 0; i < sessionSignals.length; i += 1) {
      if (sessionSignals[i].success !== false) continue;
      let waitMs = 0;
      const signalIds = [sessionSignals[i].id];
      const actionFamilies: string[] = [];
      let steps = 0;
      for (let j = i + 1; j < sessionSignals.length; j += 1) {
        const signal = sessionSignals[j];
        signalIds.push(signal.id);
        if (signal.actionFamily) {
          actionFamilies.push(signal.actionFamily);
        }
        waitMs += signal.waitMs ?? 0;
        steps += 1;
        if (signal.success === true) {
          traces.push({
            contextArchetype: sessionSignals[i].contextArchetype,
            sessionId: sessionSignals[i].sessionId,
            steps,
            waitMs,
            signalIds,
            sequenceKey: actionFamilies.join(' -> ') || 'direct-recovery',
          });
          break;
        }
      }
    }
  }
  return traces;
}

function groupRecoveriesByContext(
  traces: RecoveryTrace[],
): Map<string, RecoveryTrace[]> {
  const groups = new Map<string, RecoveryTrace[]>();
  for (const trace of traces) {
    pushGroup(groups, trace.contextArchetype, trace);
  }
  return groups;
}

function countRevisits(path: string[]): number {
  const seen = new Set<string>();
  let revisits = 0;
  for (const node of path) {
    if (seen.has(node)) {
      revisits += 1;
    }
    seen.add(node);
  }
  return revisits;
}

function countOscillation(path: string[]): number {
  let oscillation = 0;
  for (let i = 2; i < path.length; i += 1) {
    if (path[i] === path[i - 2] && path[i] !== path[i - 1]) {
      oscillation += 1;
    }
  }
  return oscillation;
}

function countModalitySwitches(signals: BehaviorSignal[]): number {
  let switches = 0;
  for (let i = 1; i < signals.length; i += 1) {
    if (signals[i].modality !== signals[i - 1].modality) {
      switches += 1;
    }
  }
  return switches;
}

function countSessionRetries(signals: BehaviorSignal[]): number {
  const attempts = new Set<string>();
  let retries = 0;
  for (const signal of signals) {
    const key = `${signal.componentFamily ?? 'unknown'}::${signal.actionFamily ?? 'unknown'}`;
    if (attempts.has(key)) {
      retries += 1;
      continue;
    }
    attempts.add(key);
  }
  return retries;
}

function mostFrequent(values: string[]): { value: string; count: number } | null {
  if (values.length === 0) return null;
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  let bestValue: string | null = null;
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue ? { value: bestValue, count: bestCount } : null;
}

function pushGroup<T>(groups: Map<string, T[]>, key: string, value: T): void {
  const existing = groups.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  groups.set(key, [value]);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function safeRatio(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}

function computeFittsId(amplitude: number, width: number): number {
  return Math.log2(amplitude / Math.max(width, 1) + 1);
}

function resolveNow(input: BehaviorAnalyzerInput, config?: AnalyzerConfig): number {
  return config?.now?.() ?? input.now;
}

function severityFromThresholdPairs(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  for (const threshold of thresholds) {
    if (threshold.value >= threshold.high) {
      return 'high';
    }
  }

  for (const threshold of thresholds) {
    if (threshold.value >= threshold.medium) {
      return 'medium';
    }
  }

  return 'low';
}

function severityFromUpperBounds(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  for (const threshold of thresholds) {
    if (threshold.value < threshold.high) {
      return 'high';
    }
  }

  for (const threshold of thresholds) {
    if (threshold.value < threshold.medium) {
      return 'medium';
    }
  }

  return 'low';
}

function severityFromRequiredThresholds(
  thresholds: Array<{ value: number; high: number; medium: number }>,
): 'low' | 'medium' | 'high' {
  if (thresholds.every((threshold) => threshold.value >= threshold.high)) {
    return 'high';
  }

  if (thresholds.every((threshold) => threshold.value >= threshold.medium)) {
    return 'medium';
  }

  return 'low';
}

function maxSeverity(
  ...levels: Array<'low' | 'medium' | 'high'>
): 'low' | 'medium' | 'high' {
  if (levels.includes('high')) {
    return 'high';
  }

  if (levels.includes('medium')) {
    return 'medium';
  }

  return 'low';
}

function humanizeContext(contextArchetype: string): string {
  return contextArchetype
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
