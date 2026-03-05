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
});
