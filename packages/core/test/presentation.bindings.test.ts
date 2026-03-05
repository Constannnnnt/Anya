import { describe, expect, it } from 'vitest';
import { extractBindingsFromSpec } from '../src/presentation/uiBuilder';
import type { UIRenderSpec } from '../src/types';

describe('presentation binding extraction', () => {
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

    const plan = extractBindingsFromSpec(spec);
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

    const plan = extractBindingsFromSpec(spec);
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
});
