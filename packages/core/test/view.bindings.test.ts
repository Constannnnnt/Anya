import { describe, expect, it } from 'vitest';
import { extractActionBindings } from '../src/views/builder';
import type { UIRenderSpec } from '../src/types';

describe('view binding extraction', () => {
  it('maps interaction tool_call to a tool_call binding action', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'btn-1',
          type: 'Button',
          props: { text: 'Rotate' },
          interactions: [
            {
              trigger: 'onClick',
              action: 'rotate',
              description: 'Rotate image',
              tool_call: {
                name: 'rotate-image',
                parameters: { angle: 90 },
              },
            },
          ],
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0].action).toEqual({
      type: 'tool_call',
      toolId: 'rotate-image',
      args: { angle: 90 },
    });
  });

  it('maps semantic-only interactions to semantic_event bindings', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'btn-1',
          type: 'Button',
          props: { label: 'Open details' },
          interactions: [
            {
              trigger: 'onClick',
              action: 'open_details',
              description: 'Open details panel',
            },
          ],
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0].action).toEqual({
      type: 'semantic_event',
      semanticAction: 'open_details',
      description: 'Open details panel',
      payload: {
        targetAction: 'open_details',
        targetIds: [],
      },
    });
  });

  it('maps explicit onChange interactions onto the native value_change event channel', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'input-1',
          type: 'TextInput',
          props: { value: '' },
          interactions: [
            {
              trigger: 'onChange',
              action: 'filter_results',
              description: 'Filter while typing',
            },
          ],
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0]).toMatchObject({
      componentId: 'input-1',
      trigger: 'onChange',
      actionMatch: 'value_change',
    });
    expect(plan.bindings[0].action).toEqual({
      type: 'semantic_event',
      semanticAction: 'filter_results',
      description: 'Filter while typing',
      payload: {
        targetAction: 'filter_results',
        targetIds: [],
      },
    });
  });

  it('generates unique binding ids for repeated action and trigger combinations', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'btn-1',
          type: 'Button',
          props: { label: 'Open details' },
          interactions: [
            {
              trigger: 'onClick',
              action: 'open_details',
              description: 'Open details panel',
            },
            {
              trigger: 'onClick',
              action: 'open_details',
              description: 'Open details panel in a new region',
            },
          ],
        },
      ],
    };

    const plan = extractActionBindings(spec);
    const bindingIds = plan.bindings.map((binding) => binding.id);

    expect(plan.bindings).toHaveLength(2);
    expect(new Set(bindingIds).size).toBe(bindingIds.length);
  });

  it('does not treat component-id bindTo targets as data nodes', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'slider-1',
          type: 'Slider',
          props: {
            value: { $data: { nodeId: 'params', path: 'hidden' } },
          },
          bindTo: [
            { targetId: 'chart-1', targetProp: 'datasets[0].data[0]' },
            'params',
          ],
        },
        {
          id: 'chart-1',
          type: 'BarChart',
          props: {
            labels: ['Hidden'],
            datasets: [{ label: 'Value', data: [1] }],
          },
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0]).toMatchObject({
      componentId: 'slider-1',
      trigger: 'onChange',
      actionMatch: 'value_change',
      action: {
        type: 'data_update',
        nodeId: 'params',
        path: 'hidden',
      },
    });
  });

  it('uses explicit bindTo target paths for data-node updates', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'slider-1',
          type: 'Slider',
          props: {
            value: 10,
          },
          bindTo: [{ targetId: 'params', targetProp: 'hidden' }],
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0].action).toEqual({
      type: 'data_update',
      nodeId: 'params',
      path: 'hidden',
      value: { $event: 'newValue' },
    });
  });

  it('infers data_update paths from non-value controlled props', () => {
    const spec: UIRenderSpec = {
      spec_version: 1,
      layout: 'stack',
      components: [
        {
          id: 'checkbox-1',
          type: 'Checkbox',
          props: {
            label: 'Enabled',
            checked: { $data: { nodeId: 'feature_flags', path: 'enabled' } },
          },
        },
      ],
    };

    const plan = extractActionBindings(spec);
    expect(plan.bindings).toHaveLength(1);
    expect(plan.bindings[0].action).toEqual({
      type: 'data_update',
      nodeId: 'feature_flags',
      path: 'enabled',
      value: { $event: 'newValue' },
    });
  });
});
