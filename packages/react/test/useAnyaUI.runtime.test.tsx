import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import { AnyaProvider } from '../src/Provider';
import { useAnyaUI } from '../src/hooks/useAnyaUI';
import type { AnyaComponent } from '../src/defineComponent';
import {
  collectAgentSessionEvents,
  collectArtifactsFromSessionEvents,
} from '@anya-ui/core';
import type {
  AgentSessionTransport,
  PresentationPlan,
} from '@anya-ui/core';

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

  it('emits ui.presented and interaction.measured with safe derived telemetry', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    const presentedEvents: Array<{
      uiId: string;
      componentCount: number;
      interactiveCount: number;
      actionableCount: number;
      componentFamilies: string[];
      actionFamilies: string[];
    }> = [];
    const measuredEvents: Array<{
      interactionEventId: string;
      elementId: string;
      componentName: string;
      action: string;
      measurement: Record<string, unknown>;
    }> = [];

    const unsubscribePresented = result.current.subscribeRuntimeEvents('ui.presented', (event) => {
      if (event.type === 'ui.presented') {
        presentedEvents.push(event.payload.surface);
      }
    });
    const unsubscribeMeasured = result.current.subscribeRuntimeEvents('interaction.measured', (event) => {
      if (event.type === 'interaction.measured') {
        measuredEvents.push(event.payload);
      }
    });

    act(() => {
      result.current.publishSpec({
        layout: 'stack',
        components: [
          {
            id: 'cta',
            type: 'Heading',
            props: { text: 'Call to action' },
            interactions: [
              {
                trigger: 'onClick',
                action: 'submit',
                description: 'Submit the form',
              },
            ],
          },
        ],
      });
      result.current.recordInteraction({
        timestamp: 1,
        elementId: 'input-1',
        componentName: 'TextInput',
        action: 'change',
        propName: 'value',
        previousValue: 'old',
        newValue: 'new secret',
        semanticDescription: 'User updated text input',
      }, {
        modality: 'keyboard',
        targetWidthPx: 240,
        targetHeightPx: 44,
      });
    });

    unsubscribePresented();
    unsubscribeMeasured();

    expect(presentedEvents).toHaveLength(1);
    expect(presentedEvents[0]).toMatchObject({
      componentCount: 1,
      interactiveCount: 1,
      actionableCount: 1,
      componentFamilies: ['text'],
      actionFamilies: ['activate'],
    });
    expect(presentedEvents[0].uiId).toMatch(/^ui-/);

    expect(measuredEvents).toHaveLength(1);
    expect(measuredEvents[0]).toMatchObject({
      elementId: 'input-1',
      componentName: 'TextInput',
      action: 'change',
    });
    expect(measuredEvents[0].measurement).toMatchObject({
      modality: 'keyboard',
      componentFamily: 'input',
      componentRole: 'textbox',
      actionFamily: 'input',
      targetWidthPx: 240,
      targetHeightPx: 44,
      valueLength: 10,
      deltaLength: 7,
    });
    expect(measuredEvents[0].measurement).not.toHaveProperty('newValue');
    expect(measuredEvents[0].measurement).not.toHaveProperty('previousValue');

    const storedInteraction = result.current.context.memory.getRecentInteractions(1)[0];
    expect(storedInteraction).toMatchObject({
      elementId: 'input-1',
      componentName: 'TextInput',
      action: 'change',
      semanticDescription: 'User updated text input.',
    });
    expect(storedInteraction.previousValue).toBeUndefined();
    expect(storedInteraction.newValue).toBeUndefined();
  });

  it('starts an agent session and applies the emitted surface to runtime state', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const transport: AgentSessionTransport = {
      async startSession(input) {
        const sessionId = input.sessionId ?? 'session-runtime';
        return {
          sessionId,
          controller: { cancel() {} },
          events: (async function* () {
            yield {
              type: 'session.started' as const,
              sessionId,
              timestamp: 1,
            };
            yield {
              type: 'artifact.upserted' as const,
              sessionId,
              timestamp: 2,
              artifact: {
                id: 'artifact-surface',
                sessionId,
                kind: 'surface' as const,
                version: 1,
                createdAt: 2,
                audience: 'user' as const,
                region: 'main' as const,
                payload: {
                  surface: {
                    surfaceKind: 'ui_spec' as const,
                    surfaceId: 'surface-main',
                    schema: {
                      type: 'anya.ui_spec' as const,
                      spec: {
                        spec_version: 1,
                        layout: 'stack' as const,
                        components: [
                          {
                            id: 'h-transport',
                            type: 'Heading',
                            props: { text: 'Transport Heading' },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            };
            yield {
              type: 'session.completed' as const,
              sessionId,
              timestamp: 3,
            };
          })(),
        };
      },
    };

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      const run = await result.current.startAgentSession({
        userIntent: 'Build heading',
        messages: [],
        transport,
      });
      const artifacts = collectArtifactsFromSessionEvents(await collectAgentSessionEvents(run));
      const surface = artifacts.find(
        (artifact) => artifact.kind === 'surface'
          && artifact.payload.surface.schema.type === 'anya.ui_spec',
      );

      if (!surface || surface.kind !== 'surface' || surface.payload.surface.schema.type !== 'anya.ui_spec') {
        throw new Error('Expected a primary anya.ui_spec surface artifact.');
      }

      result.current.publishSpec(surface.payload.surface.schema.spec);
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

  it('emits a terminal tool event when a planned tool call becomes stale', async () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={mockComponents}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
    });

    const toolEvents: string[] = [];
    const toolFailures: string[] = [];
    const unsubscribe = result.current.subscribeRuntimeEvents('tool.*', (event) => {
      toolEvents.push(event.type);
      if (event.type === 'tool.failed') {
        toolFailures.push(event.payload.error);
      }
    });

    let release: (() => void) | undefined;
    let unregisterTool: (() => void) | undefined;
    act(() => {
      unregisterTool = result.current.registerTool(
        {
          id: 'rotate',
          name: 'Rotate',
          description: 'Rotate image',
          execution: { mode: 'server' },
        },
        () => new Promise((resolve) => {
          release = () => resolve({ ok: true });
        }),
      );
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
          id: 'binding-tool',
          componentId: 'btn',
          actionMatch: 'tool:rotate',
          action: {
            type: 'tool_call',
            toolId: 'rotate',
            resultPatches: [
              {
                targetId: 'status',
                propName: 'text',
                value: 'done',
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
      const pendingInteraction = result.current.handleUserInteraction({
        timestamp: 3,
        elementId: 'btn',
        componentName: 'Heading',
        action: 'tool:rotate',
        trigger: 'onClick',
      });

      for (let attempt = 0; attempt < 30 && !release; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1));
      }

      if (!release) {
        throw new Error('Expected tool handler release callback to be initialized.');
      }

      result.current.publishSpec({
        layout: 'stack',
        components: [{ id: 'fresh', type: 'Heading', props: { text: 'fresh' } }],
      });

      release();
      await pendingInteraction!;
    });

    unsubscribe();
    act(() => {
      unregisterTool?.();
    });

    expect(toolEvents.filter((type) => type === 'tool.started')).toHaveLength(1);
    expect(toolEvents.filter((type) => type === 'tool.failed')).toHaveLength(1);
    expect(toolEvents.filter((type) => type === 'tool.finished')).toHaveLength(0);
    expect(toolFailures[0]).toContain('stale interaction result');
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
