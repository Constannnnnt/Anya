import { describe, expect, it } from 'vitest';
import {
  planPresentation,
  toPresentationContext,
} from '../src/presentation/protocol';
import { buildProjectionFromContext } from '../src/presentation/uiBuilder';

describe('presentation protocol (plain contracts)', () => {
  it('normalizes a plain request into internal context defaults', () => {
    const context = toPresentationContext({
      data: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1' } }],
    });

    expect(context.context_version).toBe(0);
    expect(context.dataNodes).toHaveLength(1);
    expect(context.tools).toEqual([]);
    expect(context.currentSpec).toBeNull();
    expect(context.currentBindings).toEqual([]);
  });

  it('returns a rebuild presentation result when there is no current spec', () => {
    const result = planPresentation({
      data: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1' } }],
      userContext: 'show document details',
    });

    expect(result.mode).toBe('rebuild');
    expect(result.plan.ui_spec).toEqual(result.spec);
    expect(result.bindings).toEqual(result.plan.bindings);
    expect(result.spec.components.length).toBeGreaterThan(0);
  });

  it('returns patch mode for incremental context on existing rendered spec', () => {
    const projected = buildProjectionFromContext(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'alpha' } }],
      []
    );

    const result = planPresentation({
      data: [
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'alpha' } },
        { id: 'doc-2', kind: 'document', payload: { title: 'Doc 2', content: 'beta' } },
      ],
      currentSpec: projected.spec,
      currentBindings: projected.bindings,
      userContext: 'add this new document into current UI',
    });

    expect(result.mode).toBe('patch');
    expect(result.plan.operations?.length ?? 0).toBeGreaterThan(0);
  });

  it('maps workflowContext and planner strategy fields', () => {
    const context = toPresentationContext({
      workflowContext: 'analysis',
      workflowContexts: [
        {
          name: 'analysis',
          description: 'Analyze docs',
          components: ['Card'],
        },
      ],
      plannerStrategy: 'always_rebuild',
    });

    expect(context.workflowContext).toBe('analysis');
    expect(context.availableWorkflowContexts?.[0].name).toBe('analysis');
    expect(context.plannerStrategy).toBe('always_rebuild');
  });
});
