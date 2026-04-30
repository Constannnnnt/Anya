import { describe, it, expect } from 'vitest';
import { planView } from '../src/views/updatePlanner';
import { buildViewFromState } from '../src/views/builder';
import type { ViewContext } from '../src/views/types';

describe('view planner (v0)', () => {
  it('prefers patch mode for incremental new context updates', () => {
    const baseProjection = buildViewFromState(
      [
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } },
      ],
      []
    );

    const context: ViewContext = {
      context_version: 0,
      dataNodes: [
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } },
        { id: 'img-2', kind: 'image', payload: { src: 'https://example.com/a.png', alt: 'A' } },
      ],
      tools: [],
      currentSpec: baseProjection.spec,
      currentBindings: [],
      newUserContext: 'add this new context to the current UI',
    };

    const plan = planView(context);
    expect(plan.mode).toBe('patch');
    expect(plan.confidence).toBeGreaterThan(0.5);
    expect(plan.operations?.some((operation) => operation.type === 'upsert_component')).toBe(true);
  });

  it('uses rebuild mode when there is no current spec', () => {
    const context: ViewContext = {
      context_version: 0,
      dataNodes: [
        { id: 'json-1', kind: 'json', payload: { hello: 'world' } },
      ],
      tools: [],
      currentSpec: null,
      currentBindings: [],
    };

    const plan = planView(context);
    expect(plan.mode).toBe('rebuild');
    expect(plan.confidence).toBeGreaterThan(0);
    expect(plan.ui_spec.components.length).toBeGreaterThan(0);
  });

  it('removes stale non-projected bindings during patch planning', () => {
    const baseProjection = buildViewFromState(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      []
    );

    const plan = planView({
      context_version: 0,
      dataNodes: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      tools: [],
      currentSpec: baseProjection.spec,
      currentBindings: [
        {
          id: 'custom-stale-binding',
          componentId: 'data-node-doc-1',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [],
          },
        },
      ],
      newUserContext: 'keep current data only',
    });

    expect(plan.mode).toBe('patch');
    expect(plan.operations?.some((operation) =>
      operation.type === 'remove_binding'
      && operation.bindingId === 'custom-stale-binding'
    )).toBe(true);
  });

  it('uses workflow context default layout when available', () => {
    const plan = planView({
      context_version: 0,
      dataNodes: [
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } },
      ],
      tools: [],
      workflowContext: 'analysis',
      availableWorkflows: [
        {
          name: 'analysis',
          description: 'Analyze and compare evidence',
          components: ['Card', 'Table'],
          defaultLayout: 'grid',
        },
      ],
      currentSpec: null,
      currentBindings: [],
    });

    expect(plan.mode).toBe('rebuild');
    expect(plan.ui_spec.skill).toBe('analysis');
    expect(plan.ui_spec.layout).toBe('grid');
  });

  it('rebuilds when workflow context shifts from previously rendered skill', () => {
    const baseProjection = buildViewFromState(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      [],
      {
        workflowContext: 'summarize',
      }
    );

    const plan = planView({
      context_version: 0,
      dataNodes: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      tools: [],
      workflowContext: 'investigate',
      currentSpec: baseProjection.spec,
      currentBindings: [],
      newUserContext: 'continue from the same context',
    });

    expect(plan.mode).toBe('rebuild');
    expect(plan.rationale_short).toContain('Workflow context changed');
  });

  it('uses agent candidate spec/bindings when provided', () => {
    const plan = planView({
      context_version: 0,
      dataNodes: [],
      tools: [],
      currentSpec: {
        layout: 'stack',
        components: [
          { id: 'a', type: 'Text', props: { content: 'old' } },
        ],
      },
      currentBindings: [],
      candidateSpec: {
        layout: 'stack',
        components: [
          { id: 'a', type: 'Text', props: { content: 'new' } },
          { id: 'b', type: 'Button', props: { label: 'Run' } },
        ],
      },
      candidateBindings: [
        {
          id: 'binding-run',
          componentId: 'b',
          actionMatch: 'run',
          action: {
            type: 'local_patch',
            patches: [],
          },
        },
      ],
    });

    expect(plan.mode).toBe('patch');
    expect(plan.ui_spec.components).toHaveLength(2);
    expect(plan.bindings[0].id).toBe('binding-run');
    expect(plan.rationale_short).toContain('agent-provided candidate spec');
  });

  it('honors explicit rebuild mode request without keyword parsing', () => {
    const baseProjection = buildViewFromState(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      []
    );

    const plan = planView({
      context_version: 0,
      dataNodes: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      tools: [],
      currentSpec: baseProjection.spec,
      currentBindings: [],
      requestedMode: 'rebuild',
    });

    expect(plan.mode).toBe('rebuild');
    expect(plan.rationale_short).toContain('Requested rebuild mode');
  });

  it('supports always_patch planner strategy', () => {
    const plan = planView({
      context_version: 0,
      plannerStrategy: 'always_patch',
      dataNodes: [
        { id: 'json-1', kind: 'json', payload: { hello: 'world' } },
      ],
      tools: [],
      currentSpec: null,
      currentBindings: [],
    });

    expect(plan.mode).toBe('patch');
    expect(plan.strategy).toBe('always_patch');
    expect(plan.rationale_short).toContain('always_patch');
  });

  it('uses workflowContext with deterministic policy overrides', () => {
    const baseProjection = buildViewFromState(
      [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      []
    );

    const plan = planView({
      context_version: 0,
      dataNodes: [{ id: 'doc-1', kind: 'document', payload: { title: 'Doc 1', content: 'Alpha' } }],
      tools: [],
      workflowContext: 'investigate',
      currentSpec: {
        ...baseProjection.spec,
        skill: 'summarize',
      },
      currentBindings: [],
      planningPolicy: {
        patchComplexityBudget: 0.1,
      },
    });

    expect(plan.mode).toBe('rebuild');
    expect(plan.strategy).toBe('deterministic');
    expect(plan.reasons).toContain('workflow-shift');
  });
});

