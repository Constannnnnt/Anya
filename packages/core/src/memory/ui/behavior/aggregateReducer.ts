import type {
  BehaviorAggregate,
  BehaviorMetricRecord,
  BehaviorSessionSummary,
} from './schemas';

export interface AggregateReductionConfig {
  now?: number;
  windowMs?: number;
}

export function reduceBehaviorAggregates(
  summaries: BehaviorSessionSummary[],
  config?: AggregateReductionConfig,
): BehaviorAggregate[] {
  const now = config?.now ?? Date.now();
  const filtered = typeof config?.windowMs === 'number'
    ? summaries.filter((summary) => now - summary.updatedTs <= config.windowMs!)
    : summaries;

  const contextGroups = new Map<string, BehaviorSessionSummary[]>();
  const globalGroups = new Map<string, BehaviorSessionSummary[]>();

  for (const summary of filtered) {
    pushGroup(contextGroups, `${summary.actorId}::context:${summary.contextArchetype}`, summary);
    pushGroup(globalGroups, `${summary.actorId}::global`, summary);
  }

  return [
    ...buildAggregates(contextGroups, true),
    ...buildAggregates(globalGroups, false),
  ];
}

function buildAggregates(
  groups: Map<string, BehaviorSessionSummary[]>,
  scoped: boolean,
): BehaviorAggregate[] {
  return [...groups.values()].map((summaries) => {
    const first = summaries[0];
    const windowStartTs = Math.min(...summaries.map((summary) => summary.updatedTs));
    const windowEndTs = Math.max(...summaries.map((summary) => summary.updatedTs));
    return {
      id: `bagg:${first.actorId}:${scoped ? first.contextArchetype : 'global'}`,
      actorId: first.actorId,
      scopeKey: scoped ? `context:${first.contextArchetype}` : 'global',
      contextArchetype: scoped ? first.contextArchetype : undefined,
      windowStartTs,
      windowEndTs,
      sessionCount: new Set(summaries.map((summary) => summary.sessionId)).size,
      interactionCount: summaries.reduce((sum, summary) => sum + summary.interactionCount, 0),
      aggregateMetrics: mergeAggregateMetrics(summaries),
      updatedTs: windowEndTs,
    };
  });
}

function mergeAggregateMetrics(summaries: BehaviorSessionSummary[]): BehaviorMetricRecord {
  const allKeys = new Set<string>();
  for (const summary of summaries) {
    Object.keys(summary.aggregateMetrics).forEach((key) => allKeys.add(key));
  }

  const aggregate: BehaviorMetricRecord = {};
  for (const key of allKeys) {
    const weighted = summaries
      .map((summary) => ({
        value: summary.aggregateMetrics[key],
        weight: Math.max(summary.signalCount, 1),
      }))
      .filter((entry): entry is { value: number; weight: number } => typeof entry.value === 'number');
    if (weighted.length === 0) continue;
    const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
    aggregate[key] = weighted.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
  }
  return aggregate;
}

function pushGroup(
  groups: Map<string, BehaviorSessionSummary[]>,
  key: string,
  summary: BehaviorSessionSummary,
): void {
  const existing = groups.get(key);
  if (existing) {
    existing.push(summary);
    return;
  }
  groups.set(key, [summary]);
}
