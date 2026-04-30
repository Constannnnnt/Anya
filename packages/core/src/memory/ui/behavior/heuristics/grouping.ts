/**
 * Shared data grouping and counting utilities for HCI heuristic analyzers.
 */

import type { BehaviorSessionSummary, BehaviorSignal } from '../schemas';
import type { PracticeSample, RecoveryTrace } from './types';
import { average, safeRatio } from './math';

export function pushGroup<T>(groups: Map<string, T[]>, key: string, value: T): void {
  const existing = groups.get(key);
  if (existing) {
    existing.push(value);
    return;
  }
  groups.set(key, [value]);
}

export function groupSummariesByContext(summaries: BehaviorSessionSummary[]): Map<string, BehaviorSessionSummary[]> {
  const groups = new Map<string, BehaviorSessionSummary[]>();
  for (const summary of summaries) {
    pushGroup(groups, summary.contextArchetype, summary);
  }
  return groups;
}

export function groupSignalsByContext(signals: BehaviorSignal[]): Map<string, BehaviorSignal[]> {
  const groups = new Map<string, BehaviorSignal[]>();
  for (const signal of signals) {
    pushGroup(groups, signal.contextArchetype, signal);
  }
  return groups;
}

export function groupSignalsBySession(signals: BehaviorSignal[]): BehaviorSignal[][] {
  const groups = new Map<string, BehaviorSignal[]>();
  const sorted = [...signals].sort((left, right) => left.ts - right.ts);
  for (const signal of sorted) {
    pushGroup(groups, signal.sessionId, signal);
  }
  return [...groups.values()];
}

export function groupSignalsBySessionAndContext(
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

export function groupNavigationSessionsByContext(
  sessions: Array<{ contextArchetype: string; sessionId: string; signals: BehaviorSignal[] }>,
): Map<string, Array<{ sessionId: string; signals: BehaviorSignal[] }>> {
  const groups = new Map<string, Array<{ sessionId: string; signals: BehaviorSignal[] }>>();
  for (const session of sessions) {
    const value = { sessionId: session.sessionId, signals: session.signals };
    pushGroup(groups, session.contextArchetype, value);
  }
  return groups;
}

export function groupRecoveriesByContext(
  traces: RecoveryTrace[],
): Map<string, RecoveryTrace[]> {
  const groups = new Map<string, RecoveryTrace[]>();
  for (const trace of traces) {
    pushGroup(groups, trace.contextArchetype, trace);
  }
  return groups;
}

export function groupPracticeSamples(
  samples: PracticeSample[],
): Map<string, PracticeSample[]> {
  const groups = new Map<string, PracticeSample[]>();
  for (const sample of samples) {
    pushGroup(groups, `${sample.contextArchetype}::${sample.sequenceKey}`, sample);
  }
  return groups;
}

export function countRevisits(path: string[]): number {
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

export function countOscillation(path: string[]): number {
  let oscillation = 0;
  for (let i = 2; i < path.length; i += 1) {
    if (path[i] === path[i - 2] && path[i] !== path[i - 1]) {
      oscillation += 1;
    }
  }
  return oscillation;
}

export function countModalitySwitches(signals: BehaviorSignal[]): number {
  let switches = 0;
  for (let i = 1; i < signals.length; i += 1) {
    if (signals[i].modality !== signals[i - 1].modality) {
      switches += 1;
    }
  }
  return switches;
}

export function countSessionRetries(signals: BehaviorSignal[]): number {
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

export function mostFrequent(values: string[]): { value: string; count: number } | null {
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

export function collectRecoveryTraces(signals: BehaviorSignal[]): RecoveryTrace[] {
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

export function buildPracticeSamples(
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

export function buildPracticeSequenceKey(signals: BehaviorSignal[]): string {
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

export function countPracticeImprovements(
  samples: Array<{ burdenScore: number; retryCount: number; failureRate: number }>,
): number {
  let improvedSampleCount = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    const burdenImproved = current.burdenScore < previous.burdenScore;
    const retryImproved = current.retryCount <= previous.retryCount;
    const failureImproved = current.failureRate <= previous.failureRate;
    if (burdenImproved && retryImproved && failureImproved) {
      improvedSampleCount += 1;
    }
  }
  return improvedSampleCount;
}

export function dominantSampleConsistency(modalities: string[]): number {
  const dominant = mostFrequent(modalities);
  return (dominant?.count ?? 0) / Math.max(modalities.length, 1);
}
