import { describe, expect, it, vi } from 'vitest';
import { createRuntimeEvent } from '../src/runtime/events';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import { TriggerManager } from '../src/memory/ui/triggerManager';
import { UiEventCollector } from '../src/memory/ui/eventCollector';
import { UiMemoryPipeline } from '../src/memory/ui/pipeline';

async function waitForCondition(
  check: () => Promise<boolean> | boolean,
  timeoutMs = 1500,
): Promise<void> {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (await check()) return;
    if (Date.now() - started > timeoutMs) {
      throw new Error('Timed out waiting for condition.');
    }
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

describe('UiMemoryPipeline', () => {
  it('serializes extraction runs when multiple hard triggers arrive quickly', async () => {
    const store = new InMemoryMemoryStore();
    const trigger = new TriggerManager({ debounceMs: 0 });

    let inFlight = 0;
    let maxConcurrent = 0;
    const runPrompt = vi.fn(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return '[]';
    });

    const pipeline = new UiMemoryPipeline({
      actorId: 'actor-1',
      sessionId: 'session-1',
      store,
      trigger,
      runPrompt,
    });
    pipeline.start();

    const collector = new UiEventCollector(store, trigger, {
      actorId: 'actor-1',
      sessionId: 'session-1',
    });

    for (let i = 0; i < 5; i += 1) {
      await collector.collect(
        createRuntimeEvent(
          'preference.explicit',
          {
            category: 'ui',
            key: `k-${i}`,
            value: `v-${i}`,
            statement: `s-${i}`,
          },
          {
            id: `evt-hard-${i}`,
            source: 'user',
          },
        ),
      );
    }

    await waitForCondition(async () => {
      const cursor = await store.getCursor('ui_memory');
      return cursor?.lastProcessedEventId === 'evt-hard-4';
    });

    expect(runPrompt).toHaveBeenCalled();
    expect(maxConcurrent).toBe(1);
  });
});

