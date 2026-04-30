import { createBehaviorFinding, type BehaviorAnalyzer, type BehaviorAnalyzerFinding } from '../analyzers';
import type { AnalyzerConfig } from './types';
import { resolveNow } from './types';
import { clamp, humanizeContext } from './math';
import { buildPracticeSamples, countPracticeImprovements, dominantSampleConsistency, groupPracticeSamples, mostFrequent } from './grouping';

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
