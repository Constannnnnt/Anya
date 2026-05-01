import type {
  BehaviorMetricRecord,
  BehaviorSegment,
  BehaviorSessionSummary,
  BehaviorSignal,
} from './schemas';

export function projectBehaviorSessionSummaries(
  segments: BehaviorSegment[],
  signals: BehaviorSignal[],
): BehaviorSessionSummary[] {
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  const groups = new Map<string, {
    actorId: string;
    sessionId: string;
    contextArchetype: string;
    segments: BehaviorSegment[];
    signals: BehaviorSignal[];
  }>();

  for (const segment of segments) {
    const key = `${segment.actorId}::${segment.sessionId}::${segment.contextArchetype}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        actorId: segment.actorId,
        sessionId: segment.sessionId,
        contextArchetype: segment.contextArchetype,
        segments: [],
        signals: [],
      };
      groups.set(key, group);
    }
    group.segments.push(segment);
    for (const signalId of segment.signalIds) {
      const signal = signalsById.get(signalId);
      if (signal) {
        group.signals.push(signal);
      }
    }
  }

  return [...groups.values()].map((group) => {
    const updatedTs = Math.max(
      ...group.segments.map((segment) => segment.endedTs),
      ...group.signals.map((signal) => signal.ts),
    );
    return {
      id: `bsum:${group.actorId}:${group.sessionId}:${group.contextArchetype}`,
      actorId: group.actorId,
      sessionId: group.sessionId,
      contextArchetype: group.contextArchetype,
      signalCount: group.signals.length,
      segmentCount: group.segments.length,
      interactionCount: group.segments.reduce((sum, segment) => sum + segment.interactionCount, 0),
      aggregateMetrics: buildAggregateMetrics(group.signals, group.segments),
      updatedTs,
    };
  });
}

function buildAggregateMetrics(
  signals: BehaviorSignal[],
  segments: BehaviorSegment[],
): BehaviorMetricRecord {
  const metrics: BehaviorMetricRecord = {};
  const averageMetrics: Array<[keyof BehaviorSignal, string]> = [
    ['waitMs', 'avg_wait_ms'],
    ['travelPx', 'avg_travel_px'],
    ['pathLengthPx', 'avg_path_length_px'],
    ['pathWidthPx', 'avg_path_width_px'],
    ['dragDistancePx', 'avg_drag_distance_px'],
    ['choiceSetSize', 'avg_choice_set_size'],
    ['targetWidthPx', 'avg_target_width_px'],
    ['targetHeightPx', 'avg_target_height_px'],
    ['focusMovesSinceLast', 'avg_focus_moves'],
    ['homingTransitionsSinceLast', 'avg_homing_transitions'],
    ['valueLength', 'avg_value_length'],
    ['deltaLength', 'avg_delta_length'],
  ];

  for (const [sourceKey, metricKey] of averageMetrics) {
    const values = signals
      .map((signal) => signal[sourceKey])
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length > 0) {
      metrics[metricKey] = average(values);
    }
  }

  const successSignals = signals.filter((signal) => signal.success !== undefined);
  if (successSignals.length > 0) {
    metrics.success_rate = successSignals.filter((signal) => signal.success === true).length / successSignals.length;
    metrics.failure_rate = successSignals.filter((signal) => signal.success === false).length / successSignals.length;
  }

  const interactionCount = segments.reduce((sum, segment) => sum + segment.interactionCount, 0);
  if (interactionCount > 0) {
    metrics.retry_rate = segments.reduce((sum, segment) => sum + segment.retryCount, 0) / interactionCount;
  }

  if (signals.length > 0) {
    const modalities = new Map<string, number>();
    for (const signal of signals) {
      modalities.set(signal.modality, (modalities.get(signal.modality) ?? 0) + 1);
    }
    for (const [modality, count] of modalities) {
      metrics[`${modality}_share`] = count / signals.length;
    }
  }

  return metrics;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
