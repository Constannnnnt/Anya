import { describe, it, expect } from 'vitest';
import { createInitialRuntimeState, createRuntimeEvent } from '../src/runtime/events';
import { runtimeReducer } from '../src/runtime/reducer';

describe('runtimeReducer', () => {
  it('updates session intent', () => {
    const base = createInitialRuntimeState();
    const event = createRuntimeEvent('session.intent_updated', { userIntent: 'Build dashboard' });
    const next = runtimeReducer(base, event);

    expect(next.session.userIntent).toBe('Build dashboard');
    expect(next.lastEventId).toBe(event.id);
  });

  it('records interactions', () => {
    const base = {
      ...createInitialRuntimeState(),
      ui: {
        ...createInitialRuntimeState().ui,
        spec: {
          layout: 'stack' as const,
          components: [
            { id: 'slider', type: 'ColorSlider', props: { value: 10 } },
          ],
        },
      },
    };
    const event = createRuntimeEvent('interaction.recorded', {
      record: {
        timestamp: 1,
        elementId: 'slider',
        componentName: 'ColorSlider',
        action: 'change',
        propName: 'value',
        newValue: 42,
      },
    });

    const next = runtimeReducer(base, event);
    expect(next.memory.interactions).toHaveLength(1);
    expect(next.memory.interactions[0].elementId).toBe('slider');
    expect(next.ui.spec?.components[0].props.value).toBe(42);

    event.payload.record.newValue = 999;
    expect(next.memory.interactions[0].newValue).toBe(42);
  });

  it('sets spec and session metadata on decoded specs', () => {
    const base = createInitialRuntimeState();
    const event = createRuntimeEvent('spec.decoded', {
      spec: {
        skill: 'analytics',
        layout: 'grid',
        components: [],
      },
    });

    const next = runtimeReducer(base, event);
    expect(next.ui.spec?.layout).toBe('grid');
    expect(next.session.status).toBe('rendering');
    expect(next.session.workflowContext).toBe('analytics');
  });

  it('keeps only the newest 100 interactions in order', () => {
    let state = createInitialRuntimeState();

    for (let i = 0; i < 130; i += 1) {
      state = runtimeReducer(state, createRuntimeEvent('interaction.recorded', {
        record: {
          timestamp: i,
          elementId: `input-${i}`,
          componentName: 'TextInput',
          action: 'change',
          propName: 'value',
          newValue: i,
        },
      }));
    }

    expect(state.memory.interactions).toHaveLength(100);
    expect(state.memory.interactions[0].timestamp).toBe(30);
    expect(state.memory.interactions[99].timestamp).toBe(129);
  });

  it('caps and clones hydrated interaction history', () => {
    const base = createInitialRuntimeState();
    const hydrated = Array.from({ length: 130 }, (_, i) => ({
      timestamp: i,
      elementId: `h-${i}`,
      componentName: 'TextInput',
      action: 'change',
      propName: 'value',
      newValue: i,
    }));

    const next = runtimeReducer(base, createRuntimeEvent('memory.hydrated', {
      state: {
        memory: {
          interactions: hydrated,
        },
      },
    }));

    expect(next.memory.interactions).toHaveLength(100);
    expect(next.memory.interactions[0].timestamp).toBe(30);
    expect(next.memory.interactions[99].timestamp).toBe(129);

    hydrated[129]!.newValue = 9999;
    expect(next.memory.interactions[99].newValue).toBe(129);
  });
});
