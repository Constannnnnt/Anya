import { describe, expect, it } from 'vitest';
import type { PresentationPlan, UIBinding } from '../src/presentation/types';
import type { UIRenderSpec } from '../src/types';
import {
  applyLocalUIUpdates,
  applyPresentationOperations,
  applyPresentationPlan,
} from '../src/presentation/uiUpdater';

describe('presentation patch performance behavior', () => {
  it('avoids spec cloning for binding-only operations', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'text-1',
          type: 'Text',
          props: { content: 'A' },
        },
      ],
    };
    const bindings: UIBinding[] = [];

    const result = applyPresentationOperations(spec, bindings, [
      {
        type: 'upsert_binding',
        binding: {
          id: 'binding-1',
          componentId: 'text-1',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [],
          },
        },
      },
    ]);

    expect(result.spec).toBe(spec);
    expect(result.bindings).not.toBe(bindings);
    expect(result.bindings).toHaveLength(1);
  });

  it('preserves untouched branch references for local patch updates', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'left',
          type: 'Card',
          props: { title: 'Left' },
          children: [
            {
              id: 'left-child',
              type: 'Text',
              props: { content: 'old' },
            },
          ],
        },
        {
          id: 'right',
          type: 'Card',
          props: { title: 'Right' },
        },
      ],
    };

    const result = applyLocalUIUpdates(
      spec,
      [
        {
          targetId: 'left-child',
          propName: 'content',
          value: 'new',
        },
      ],
      (value) => value
    );

    expect(result.applied).toBe(1);
    expect(result.updatedSpec).not.toBe(spec);
    expect(result.updatedSpec.components[1]).toBe(spec.components[1]);
    expect(result.updatedSpec.components[0]).not.toBe(spec.components[0]);
    expect(result.updatedSpec.components[0].children?.[0].props.content).toBe('new');
  });

  it('escalates to rebuild when patch operation budget is exceeded', () => {
    const spec: UIRenderSpec = {
      layout: 'stack',
      components: [
        {
          id: 'text-1',
          type: 'Text',
          props: { content: 'A' },
        },
      ],
    };

    const plan: PresentationPlan = {
      plan_version: 0,
      mode: 'patch',
      confidence: 0.9,
      ui_spec: spec,
      bindings: [],
      operations: Array.from({ length: 120 }, (_, index) => ({
        type: 'upsert_binding' as const,
        binding: {
          id: `binding-${index}`,
          componentId: 'text-1',
          actionMatch: 'custom',
          action: {
            type: 'local_patch' as const,
            patches: [],
          },
        },
      })),
    };

    const applied = applyPresentationPlan(spec, [], plan, {
      maxPatchOperations: 100,
      maxPatchOperationsPerComponent: 200,
    });

    expect(applied.modeApplied).toBe('rebuild');
    expect(applied.rebuildEscalated).toBe(true);
    expect(applied.appliedOperations).toBe(0);
  });
});
