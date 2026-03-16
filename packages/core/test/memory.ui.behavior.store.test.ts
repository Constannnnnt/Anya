import { describe, expect, it } from 'vitest';
import {
  InMemoryBehaviorStore,
  type BehaviorAggregate,
  type BehaviorSegment,
  type BehaviorSessionSummary,
  type BehaviorSignal,
} from '../src/memory/ui/behavior';

function makeSignal(overrides: Partial<BehaviorSignal> = {}): BehaviorSignal {
  return {
    id: `sig-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    sourceEventId: 'evt-1',
    sourceEventType: 'interaction.measured',
    ts: 1,
    contextArchetype: 'browse_scan',
    modality: 'pointer',
    ...overrides,
  };
}

function makeSegment(overrides: Partial<BehaviorSegment> = {}): BehaviorSegment {
  return {
    id: `seg-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    contextArchetype: 'browse_scan',
    startedTs: 1,
    endedTs: 2,
    signalIds: ['sig-1'],
    interactionCount: 1,
    modalityMix: ['pointer'],
    successCount: 1,
    failureCount: 0,
    retryCount: 0,
    ...overrides,
  };
}

function makeSummary(overrides: Partial<BehaviorSessionSummary> = {}): BehaviorSessionSummary {
  return {
    id: `sum-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    sessionId: 'session-1',
    contextArchetype: 'browse_scan',
    signalCount: 1,
    segmentCount: 1,
    interactionCount: 1,
    aggregateMetrics: { avg_choice_set_size: 3 },
    updatedTs: 3,
    ...overrides,
  };
}

function makeAggregate(overrides: Partial<BehaviorAggregate> = {}): BehaviorAggregate {
  return {
    id: `agg-${Math.random().toString(36).slice(2, 8)}`,
    actorId: 'actor-1',
    scopeKey: 'global',
    windowStartTs: 1,
    windowEndTs: 10,
    sessionCount: 1,
    interactionCount: 1,
    aggregateMetrics: { avg_choice_set_size: 3 },
    updatedTs: 10,
    ...overrides,
  };
}

describe('InMemoryBehaviorStore', () => {
  it('upserts and queries behavior projections by actor and filters', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertSignals([
      makeSignal({ id: 'sig-1', contextArchetype: 'browse_scan', ts: 1 }),
      makeSignal({ id: 'sig-2', contextArchetype: 'edit_compose', ts: 2 }),
    ]);
    await store.upsertSegments([
      makeSegment({ id: 'seg-1', contextArchetype: 'browse_scan', endedTs: 5 }),
      makeSegment({ id: 'seg-2', contextArchetype: 'edit_compose', endedTs: 6 }),
    ]);
    await store.upsertSessionSummaries([
      makeSummary({ id: 'sum-1', contextArchetype: 'browse_scan', updatedTs: 7 }),
      makeSummary({ id: 'sum-2', contextArchetype: 'edit_compose', updatedTs: 8 }),
    ]);
    await store.upsertAggregates([
      makeAggregate({ id: 'agg-1', scopeKey: 'global', updatedTs: 9 }),
      makeAggregate({ id: 'agg-2', scopeKey: 'context:edit_compose', contextArchetype: 'edit_compose', updatedTs: 10 }),
    ]);

    expect(await store.findSignals('actor-1', { contextArchetype: 'edit_compose' })).toHaveLength(1);
    expect(await store.findSegments('actor-1', { contextArchetype: 'browse_scan' })).toHaveLength(1);
    expect(await store.findSessionSummaries('actor-1', { contextArchetype: 'edit_compose' })).toHaveLength(1);
    expect(await store.findAggregates('actor-1', { scopeKey: 'global' })).toHaveLength(1);
  });

  it('updates actor indexes when an existing record is reassigned to another actor', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertSignals([
      makeSignal({ id: 'sig-shared', actorId: 'actor-1' }),
    ]);
    await store.upsertSignals([
      makeSignal({ id: 'sig-shared', actorId: 'actor-2', contextArchetype: 'edit_compose' }),
    ]);

    expect(await store.findSignals('actor-1')).toEqual([]);
    expect(await store.findSignals('actor-2')).toEqual([
      expect.objectContaining({
        id: 'sig-shared',
        actorId: 'actor-2',
        contextArchetype: 'edit_compose',
      }),
    ]);
  });

  it('exports cloned snapshots', async () => {
    const store = new InMemoryBehaviorStore();
    await store.upsertSignals([makeSignal({ id: 'sig-1' })]);

    const snapshot = await store.exportJson();
    expect(snapshot.signals).toHaveLength(1);
    snapshot.signals[0].contextArchetype = 'mutated';

    const verify = await store.findSignals('actor-1');
    expect(verify[0].contextArchetype).toBe('browse_scan');
  });
});
