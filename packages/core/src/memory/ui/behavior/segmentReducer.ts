import { nextGeneratedId } from '../../../id';
import type { BehaviorSegment, BehaviorSignal } from './schemas';

export interface SegmentReductionConfig {
  maxGapMs?: number;
}

export function reduceBehaviorSegments(
  signals: BehaviorSignal[],
  config?: SegmentReductionConfig,
): BehaviorSegment[] {
  const maxGapMs = config?.maxGapMs ?? 30_000;
  const sorted = [...signals].sort(compareSignals);
  const segments: BehaviorSegment[] = [];

  let current: BehaviorSignal[] = [];

  const flush = () => {
    if (current.length === 0) return;
    segments.push(buildSegment(current));
    current = [];
  };

  for (const signal of sorted) {
    if (current.length === 0) {
      current.push(signal);
      continue;
    }

    const previous = current[current.length - 1];
    const shouldSplit =
      previous.actorId !== signal.actorId
      || previous.sessionId !== signal.sessionId
      || previous.contextArchetype !== signal.contextArchetype
      || (previous.uiId && signal.uiId && previous.uiId !== signal.uiId)
      || signal.ts - previous.ts > maxGapMs;

    if (shouldSplit) {
      flush();
    }

    current.push(signal);
  }

  flush();
  return segments;
}

function buildSegment(signals: BehaviorSignal[]): BehaviorSegment {
  const first = signals[0];
  const last = signals[signals.length - 1];
  const interactionSignals = signals.filter((signal) => signal.sourceEventType === 'interaction.measured');

  return {
    id: nextGeneratedId('bseg'),
    actorId: first.actorId,
    sessionId: first.sessionId,
    contextArchetype: first.contextArchetype,
    startedTs: first.ts,
    endedTs: last.ts,
    signalIds: signals.map((signal) => signal.id),
    interactionCount: interactionSignals.length,
    modalityMix: [...new Set(signals.map((signal) => signal.modality))],
    successCount: signals.filter((signal) => signal.success === true).length,
    failureCount: signals.filter((signal) => signal.success === false).length,
    retryCount: countRetries(interactionSignals),
  };
}

function countRetries(signals: BehaviorSignal[]): number {
  const seen = new Set<string>();
  let retries = 0;
  for (const signal of signals) {
    const key = `${signal.componentFamily ?? 'unknown'}::${signal.actionFamily ?? 'unknown'}`;
    if (seen.has(key)) {
      retries += 1;
      continue;
    }
    seen.add(key);
  }
  return retries;
}

function compareSignals(left: BehaviorSignal, right: BehaviorSignal): number {
  if (left.actorId !== right.actorId) return left.actorId.localeCompare(right.actorId);
  if (left.sessionId !== right.sessionId) return left.sessionId.localeCompare(right.sessionId);
  return left.ts - right.ts;
}
