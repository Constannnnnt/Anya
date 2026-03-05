import { describe, it, expect } from 'vitest';
import { applyOptimisticUpdate } from '../src/utils';
import type { UIRenderSpec, UIInteractionRecord } from '../src/types';

describe('applyOptimisticUpdate', () => {
  it('moves a node on drop when sourceId + targetIds are present', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'source', type: 'Card', props: {} },
        { id: 'target', type: 'Section', props: {}, children: [] },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'target',
      componentName: 'Section',
      action: 'drop',
      sourceId: 'source',
      targetIds: ['target'],
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components).toHaveLength(1);
    expect(updated.components[0].id).toBe('target');
    expect(updated.components[0].children).toHaveLength(1);
    expect(updated.components[0].children?.[0].id).toBe('source');
  });

  it('updates a prop on change interactions', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'slider', type: 'ColorSlider', props: { value: 10 } },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'slider',
      componentName: 'ColorSlider',
      action: 'change',
      propName: 'value',
      newValue: 42,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components[0].props.value).toBe(42);
  });

  it('propagates change interactions through bindTo links', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'slider',
          type: 'ColorSlider',
          props: { value: 10 },
          bindTo: ['label'],
        },
        {
          id: 'label',
          type: 'Text',
          props: { value: 10 },
        },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'slider',
      componentName: 'ColorSlider',
      action: 'change',
      propName: 'value',
      newValue: 77,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components[0].props.value).toBe(77);
    expect(updated.components[1].props.value).toBe(77);
  });

  it('ignores drop interactions on non-container targets', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'source', type: 'Card', props: {} },
        { id: 'target', type: 'Button', props: { label: 'Leaf' } },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'target',
      componentName: 'Button',
      action: 'drop',
      sourceId: 'source',
      targetIds: ['target'],
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components).toHaveLength(2);
    expect(updated.components[0].id).toBe('source');
    expect(updated.components[1].id).toBe('target');
  });
});
