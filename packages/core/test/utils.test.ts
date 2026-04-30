import { describe, it, expect } from 'vitest';
import { applyOptimisticUpdate } from '../src/utils';
import type { UIRenderSpec, UIInteractionRecord } from '../src/types';

describe('applyOptimisticUpdate', () => {
  it('returns the same spec reference for non-mutating interaction actions', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'btn', type: 'Button', props: { label: 'Run' } },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'btn',
      componentName: 'Button',
      action: 'submit',
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated).toBe(spec);
  });

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

  it('treats value_change as an optimistic change action', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'slider', type: 'Slider', props: { value: 10 } },
        { id: 'label', type: 'Text', props: { value: 10 } },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'slider',
      componentName: 'Slider',
      action: 'value_change',
      propName: 'value',
      newValue: 42,
    };

    const updated = applyOptimisticUpdate({
      ...spec,
      components: [
        { id: 'slider', type: 'Slider', props: { value: 10 }, bindTo: ['label'] },
        { id: 'label', type: 'Text', props: { value: 10 } },
      ],
    }, interaction);

    expect(updated.components[0].props.value).toBe(42);
    expect(updated.components[1].props.value).toBe(42);
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

  it('maps optimistic updates across different target prop names', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'slider',
          type: 'Slider',
          props: { value: 10 },
          bindTo: [{ targetId: 'label', targetProp: 'content' }],
        },
        {
          id: 'label',
          type: 'Text',
          props: { content: '10' },
        },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'slider',
      componentName: 'Slider',
      action: 'value_change',
      propName: 'value',
      newValue: 77,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components[0].props.value).toBe(77);
    expect(updated.components[1].props.content).toBe(77);
  });

  it('updates nested target prop paths for mapped bindTo descriptors', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'slider',
          type: 'Slider',
          props: { value: 10 },
          bindTo: [{ targetId: 'chart', targetProp: 'datasets[0].data[0]' }],
        },
        {
          id: 'chart',
          type: 'BarChart',
          props: {
            labels: ['Hidden'],
            datasets: [{ label: 'Value', data: [10] }],
          },
        },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'slider',
      componentName: 'Slider',
      action: 'value_change',
      propName: 'value',
      newValue: 77,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components[1].props.datasets).toEqual([{ label: 'Value', data: [77] }]);
  });

  it('preserves $data expressions while propagating optimistic values to bound components', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'slider',
          type: 'Slider',
          props: {
            value: { $data: { nodeId: 'params', path: 'hidden' } },
          },
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
      componentName: 'Slider',
      action: 'value_change',
      propName: 'value',
      newValue: 77,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated.components[0].props.value).toEqual({ $data: { nodeId: 'params', path: 'hidden' } });
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
    expect(updated).toBe(spec);
    expect(updated.components).toHaveLength(2);
    expect(updated.components[0].id).toBe('source');
    expect(updated.components[1].id).toBe('target');
  });

  it('returns the same reference when change target is missing', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        { id: 'slider', type: 'ColorSlider', props: { value: 10 } },
      ],
    };

    const interaction: UIInteractionRecord = {
      timestamp: Date.now(),
      elementId: 'missing',
      componentName: 'ColorSlider',
      action: 'change',
      propName: 'value',
      newValue: 42,
    };

    const updated = applyOptimisticUpdate(spec, interaction);
    expect(updated).toBe(spec);
  });
});
