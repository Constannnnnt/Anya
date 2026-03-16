import { describe, it, expect } from 'vitest';
import { InMemoryMemoryStore } from '../src/memory/ui/inMemoryAdapter';
import {
  buildExtractionWindow,
  buildExtractionContext,
} from '../src/memory/ui/extractionPayload';
import type { UiMemoryEvent, MemoryCursor } from '../src/memory/ui/schemas';

function makeEvent(overrides: Partial<UiMemoryEvent> = {}): UiMemoryEvent {
  return {
    id: `evt-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    actorId: 'actor-1',
    sessionId: 'session-1',
    type: 'interaction.recorded',
    source: 'user',
    payloadJson: '{}',
    tokenEstimate: 10,
    ...overrides,
  };
}

describe('buildExtractionWindow', () => {
  it('returns all events when no cursor exists', async () => {
    const store = new InMemoryMemoryStore();
    await store.appendEvents([
      makeEvent({ id: 'e1', ts: 1 }),
      makeEvent({ id: 'e2', ts: 2 }),
    ]);

    const window = await buildExtractionWindow(store, null);
    expect(window).toHaveLength(2);
  });

  it('returns events after cursor position', async () => {
    const store = new InMemoryMemoryStore();
    await store.appendEvents([
      makeEvent({ id: 'e1', ts: 1 }),
      makeEvent({ id: 'e2', ts: 2 }),
      makeEvent({ id: 'e3', ts: 3 }),
    ]);

    const cursor: MemoryCursor = {
      namespace: 'ui_memory',
      lastProcessedEventId: 'e1',
      lastProcessedTs: 1,
      updatedTs: 1,
    };

    const window = await buildExtractionWindow(store, cursor);
    expect(window.map((e) => e.id)).toEqual(['e2', 'e3']);
  });

  it('respects maxEvents limit', async () => {
    const store = new InMemoryMemoryStore();
    for (let i = 0; i < 10; i++) {
      await store.appendEvents([makeEvent({ id: `e${i}`, ts: i, tokenEstimate: 1 })]);
    }

    const window = await buildExtractionWindow(store, null, { maxEvents: 5 });
    expect(window).toHaveLength(5);
  });

  it('splits by case boundary when over token budget', async () => {
    const store = new InMemoryMemoryStore();
    await store.appendEvents([
      makeEvent({ id: 'e1', ts: 1, caseId: 'case-A', tokenEstimate: 1000 }),
      makeEvent({ id: 'e2', ts: 2, caseId: 'case-A', tokenEstimate: 1000 }),
      makeEvent({ id: 'e3', ts: 3, caseId: 'case-B', tokenEstimate: 1000 }),
      makeEvent({ id: 'e4', ts: 4, caseId: 'case-B', tokenEstimate: 1000 }),
    ]);

    const window = await buildExtractionWindow(store, null, { maxTokens: 2500 });
    // Should include case-A events (2000 tokens) and stop before case-B
    expect(window.length).toBeLessThanOrEqual(3);
    expect(window.map((e) => e.id)).toContain('e1');
    expect(window.map((e) => e.id)).toContain('e2');
  });

  it('returns empty array when no new events', async () => {
    const store = new InMemoryMemoryStore();
    await store.appendEvents([makeEvent({ id: 'e1', ts: 1 })]);

    const cursor: MemoryCursor = {
      namespace: 'ui_memory',
      lastProcessedEventId: 'e1',
      lastProcessedTs: 1,
      updatedTs: 1,
    };

    const window = await buildExtractionWindow(store, cursor);
    expect(window).toHaveLength(0);
  });
});

describe('buildExtractionContext', () => {
  it('groups conversation events into conversations', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'session.intent_updated',
        source: 'user',
        payloadJson: JSON.stringify({ userIntent: 'Build a dashboard' }),
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.conversations).toHaveLength(1);
    expect(ctx.conversations[0]).toContain('Build a dashboard');
  });

  it('groups interaction events into uiEvents', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'interaction.recorded',
        payloadJson: JSON.stringify({
          record: {
            componentName: 'Button',
            elementId: 'btn-1',
            action: 'click',
            semanticDescription: 'User clicked submit',
          },
        }),
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.uiEvents).toHaveLength(1);
    expect(ctx.uiEvents[0]).toContain('Button#btn-1');
    expect(ctx.uiEvents[0]).toContain('User clicked submit');
  });

  it('extracts workflow context from spec decoded events', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'spec.decoded',
        payloadJson: JSON.stringify({ spec: { skill: 'dashboard_builder' } }),
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.workflowContext).toBe('dashboard_builder');
  });

  it('passes through tool manifest', () => {
    const ctx = buildExtractionContext([], {
      toolManifest: ['tool_a', 'tool_b'],
    });
    expect(ctx.toolManifest).toEqual(['tool_a', 'tool_b']);
  });

  it('excludes behavior telemetry events from semantic extraction context by default', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'ui.presented',
        payloadJson: JSON.stringify({
          surface: {
            uiId: 'ui-1',
            layout: 'stack',
          },
        }),
      }),
      makeEvent({
        type: 'interaction.measured',
        payloadJson: JSON.stringify({
          interactionEventId: 'evt-1',
          measurement: {
            modality: 'pointer',
            targetWidthPx: 120,
          },
        }),
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.uiEvents).toEqual([]);
    expect(ctx.conversations).toEqual([]);
  });

  it('formats binding and tool lifecycle events into uiEvents', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        ts: 10,
        type: 'binding.executed',
        payloadJson: JSON.stringify({
          record: {
            bindingId: 'bind-1',
            status: 'success',
            toolId: 'save-profile',
          },
        }),
      }),
      makeEvent({
        ts: 11,
        type: 'tool.started',
        payloadJson: JSON.stringify({
          toolId: 'save-profile',
          bindingId: 'bind-1',
        }),
      }),
      makeEvent({
        ts: 12,
        type: 'tool.finished',
        payloadJson: JSON.stringify({
          toolId: 'save-profile',
          durationMs: 48,
        }),
      }),
      makeEvent({
        ts: 13,
        type: 'tool.failed',
        payloadJson: JSON.stringify({
          toolId: 'save-profile',
          error: 'network timeout',
        }),
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.uiEvents).toHaveLength(4);
    expect(ctx.uiEvents[0]).toContain('binding:bind-1 status:success tool:save-profile');
    expect(ctx.uiEvents[1]).toContain('tool.start save-profile binding:bind-1');
    expect(ctx.uiEvents[2]).toContain('tool.finish save-profile duration:48');
    expect(ctx.uiEvents[3]).toContain('tool.fail save-profile error:network timeout');
  });

  it('gracefully ignores malformed payloads for typed handlers', () => {
    const events: UiMemoryEvent[] = [
      makeEvent({
        type: 'session.intent_updated',
        payloadJson: '{not-json',
      }),
      makeEvent({
        type: 'spec.decoded',
        payloadJson: 'broken',
      }),
    ];

    const ctx = buildExtractionContext(events);
    expect(ctx.conversations).toHaveLength(0);
    expect(ctx.workflowContext).toBeNull();
  });
});
