import { describe, it, expect, vi } from 'vitest';
import { UiEventCollector } from '../src/memory/ui/eventCollector';
import { TriggerManager } from '../src/memory/ui/triggerManager';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import { createRuntimeEvent } from '../src/runtime/events';

describe('UiEventCollector', () => {
  function setup() {
    const store = new InMemoryMemoryStore();
    const trigger = new TriggerManager();
    const collector = new UiEventCollector(store, trigger, {
      actorId: 'actor-1',
      sessionId: 'session-1',
      caseId: 'case-1',
    });
    return { store, trigger, collector };
  }

  it('normalizes a RuntimeEvent into a UiMemoryEvent and appends it', async () => {
    const { store, collector } = setup();
    const event = createRuntimeEvent('session.intent_updated', { userIntent: 'Test' }, {
      id: 'evt-1',
      source: 'user',
      timestamp: 1000,
    });

    const normalized = await collector.collect(event);

    expect(normalized.id).toBe('evt-1');
    expect(normalized.ts).toBe(1000);
    expect(normalized.actorId).toBe('actor-1');
    expect(normalized.sessionId).toBe('session-1');
    expect(normalized.caseId).toBe('case-1');
    expect(normalized.type).toBe('session.intent_updated');
    expect(normalized.source).toBe('user');
    expect(JSON.parse(normalized.payloadJson)).toEqual({ userIntent: 'Test' });
    expect(normalized.tokenEstimate).toBeGreaterThan(0);

    const stored = await store.readEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('evt-1');
  });

  it('batch-collects multiple events', async () => {
    const { store, collector } = setup();
    const events = [
      createRuntimeEvent('session.intent_updated', { userIntent: 'A' }, { id: 'e1' }),
      createRuntimeEvent('session.status_set', { status: 'thinking' }, { id: 'e2' }),
    ];

    const normalized = await collector.collectAll(events);
    expect(normalized).toHaveLength(2);

    const stored = await store.readEvents();
    expect(stored).toHaveLength(2);
  });

  it('notifies trigger manager on each collect', async () => {
    const { trigger, collector } = setup();
    const spy = vi.spyOn(trigger, 'observe');

    await collector.collect(
      createRuntimeEvent('session.intent_updated', { userIntent: 'X' }),
    );

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('estimates token count from payload size', async () => {
    const { collector } = setup();
    const event = createRuntimeEvent('session.intent_updated', {
      userIntent: 'A very long intent string that should produce a larger token estimate',
    });

    const normalized = await collector.collect(event);
    // Payload is ~80 chars, should be ~20 tokens at 4 chars/token
    expect(normalized.tokenEstimate).toBeGreaterThanOrEqual(10);
  });

  it('preserves correlationId and causationId', async () => {
    const { collector } = setup();
    const event = createRuntimeEvent('session.intent_updated', { userIntent: 'X' }, {
      correlationId: 'corr-1',
      causationId: 'cause-1',
    });

    const normalized = await collector.collect(event);
    expect(normalized.correlationId).toBe('corr-1');
    expect(normalized.causationId).toBe('cause-1');
  });
});
