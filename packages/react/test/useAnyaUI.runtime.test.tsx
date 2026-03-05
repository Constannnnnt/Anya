import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import { AnyaProvider } from '../src/Provider';
import { useAnyaUI } from '../src/hooks/useAnyaUI';
import type { AnyaComponent } from '../src/defineComponent';
import type { ModelTransport, PresentationPlan } from '@anya-ui/core';

const mockComponents: AnyaComponent[] = [
  {
    name: 'Heading',
    description: 'A heading component',
    propsSchema: z.object({ text: z.string() }),
    render: ({ props }) => <h1>{props.text}</h1>,
  },
];

describe('useAnyaUI runtime integration', () => {
  it('routes intent/spec/interaction updates through runtime effects', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.setUserIntent('Build a profile editor');
      result.current.publishSpec({
        skill: 'profile_edit',
        layout: 'stack',
        components: [{ id: 'h1', type: 'Heading', props: { text: 'Profile' } }],
      });
      result.current.recordInteraction({
        timestamp: 1,
        elementId: 'h1',
        componentName: 'Heading',
        action: 'custom',
        semanticDescription: 'Clicked profile title',
      });
    });

    const memory = result.current.context.memory;
    expect(memory.getContext().userIntent).toBe('Build a profile editor');
    expect(memory.getContext().workflowContext).toBe('profile_edit');
    expect(memory.getCurrentSpec()?.components[0].id).toBe('h1');
    expect(memory.getRecentInteractions(1)[0].semanticDescription).toBe('Clicked profile title');
  });

  it('supports replace intent mode to clear volatile UI session context', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.publishSpec({
        skill: 'profile_edit',
        layout: 'stack',
        components: [{ id: 'h1', type: 'Heading', props: { text: 'Profile A' } }],
      });
      result.current.recordInteraction({
        timestamp: 1,
        elementId: 'h1',
        componentName: 'Heading',
        action: 'custom',
        semanticDescription: 'Opened old profile',
      });
    });

    act(() => {
      result.current.setUserIntent('Introduce Sara Hooker', 'replace');
    });

    expect(result.current.context.memory.getCurrentSpec()).toBeNull();
    expect(result.current.context.memory.getInteractions()).toHaveLength(0);
    expect(result.current.presentationState.currentSpec).toBeNull();
    expect(result.current.presentationState.bindings).toHaveLength(0);
    expect(result.current.context.memory.getContext().userIntent).toBe('Introduce Sara Hooker');
  });

  it('runs an orchestrated agent turn with transport and updates runtime spec', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const transport: ModelTransport = {
      async complete() {
        return {
          content: [
            'spec_version: 1',
            'layout: stack',
            'components:',
            '  - id: h-transport',
            '    type: Heading',
            '    props:',
            '      text: "Transport Heading"',
          ].join('\n'),
        };
      },
    };

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await result.current.runAgentTurn({
        userIntent: 'Build heading',
        messages: [],
        transport,
      });
    });

    expect(result.current.runtimeState.ui.spec?.components[0].id).toBe('h-transport');
    expect(result.current.runtimeState.ui.spec?.components[0].props.text).toBe('Transport Heading');
  });

  it('syncs runtime/memory spec after native presentation interaction updates', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    const plan: PresentationPlan = {
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        components: [
          { id: 'status', type: 'Heading', props: { text: 'idle' } },
          { id: 'btn', type: 'Heading', props: { text: 'click' } },
        ],
      },
      bindings: [
        {
          id: 'binding-btn',
          componentId: 'btn',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [
              {
                targetId: 'status',
                propName: 'text',
                value: { $event: 'semanticDescription' },
              },
            ],
          },
        },
      ],
    };

    act(() => {
      result.current.commitPresentationPlan(plan);
    });

    await act(async () => {
      await result.current.handleUserInteraction({
        timestamp: 2,
        elementId: 'btn',
        componentName: 'Heading',
        action: 'custom',
        trigger: 'onClick',
        semanticDescription: 'patched',
      });
    });

    expect(result.current.presentationState.currentSpec?.components[0].props.text).toBe('patched');
    expect(result.current.runtimeState.ui.spec?.components[0].props.text).toBe('patched');
    expect(result.current.context.memory.getCurrentSpec()?.components[0].props.text).toBe('patched');
  });

  it('replaces stale presentation bindings when agent saves a new decoded spec', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    const plan: PresentationPlan = {
      mode: 'rebuild',
      confidence: 1,
      ui_spec: {
        layout: 'stack',
        components: [
          { id: 'status', type: 'Heading', props: { text: 'idle' } },
        ],
      },
      bindings: [
        {
          id: 'stale-binding',
          componentId: 'status',
          actionMatch: 'custom',
          action: {
            type: 'local_patch',
            patches: [
              { targetId: 'status', propName: 'text', value: 'old' },
            ],
          },
        },
      ],
    };

    act(() => {
      result.current.commitPresentationPlan(plan);
    });

    expect(result.current.getBindings().map((binding) => binding.id)).toContain('stale-binding');

    act(() => {
      result.current.publishSpec({
        layout: 'stack',
        components: [
          { id: 'fresh', type: 'Heading', props: { text: 'fresh' } },
        ],
      });
    });

    expect(result.current.getBindings()).toEqual([]);
    expect(result.current.presentationState.currentSpec?.components[0].id).toBe('fresh');
  });

  it('supports workflowContext naming for presentation planning', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      result.current.setWorkflowContext('analysis');
      result.current.setPresentationData([
        { id: 'doc-1', kind: 'document', payload: { title: 'Doc', content: 'Alpha' } },
      ]);
    });

    let plan: ReturnType<typeof result.current.planPresentation>;
    act(() => {
      plan = result.current.planPresentation();
    });
    expect(plan!.ui_spec.skill).toBe('analysis');
    expect(result.current.presentationState.context.workflowContext).toBe('analysis');
  });
});
