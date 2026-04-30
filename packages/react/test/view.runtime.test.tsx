import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { describe, expect, it } from 'vitest';
import type { FileStorage, ViewPlan } from '@anya-ui/core';
import { AnyaProvider } from '../src/Provider';
import { AdaptiveRenderer } from '../src/AdaptiveRenderer';
import { useAnyaUI } from '../src/hooks/useAnyaUI';
import { builtInPrimitives } from '../src/primitives';

class TestStorage implements FileStorage {
  private readonly data = new Map<string, string>();

  constructor(seed?: Record<string, string>) {
    for (const [key, value] of Object.entries(seed ?? {})) {
      this.data.set(key, value);
    }
  }

  async read(path: string): Promise<string | null> {
    return this.data.get(path) ?? null;
  }

  async write(path: string, content: string): Promise<void> {
    this.data.set(path, content);
  }
}

function RuntimeHarness(props?: {
  onInteractionExecuted?: (input: { durationMs: number; records: any[] }) => void;
}) {
  const { registerTool, applyViewPlan, viewState, handleUserInteraction } = useAnyaUI();

  React.useEffect(() => {
    let unregister = () => {};

    const timer = setTimeout(() => {
      unregister = registerTool(
        {
          id: 'rotate',
          name: 'Rotate Image',
          description: 'Rotate image',
        },
        ({ args }) => ({
          message: `done:${String(args.request)}`,
        })
      );

      const plan: ViewPlan = {
        mode: 'rebuild',
        confidence: 1,
        ui_spec: {
          layout: 'stack',
          components: [
            {
              id: 'status',
              type: 'Text',
              props: { content: 'idle' },
            },
            {
              id: 'rotate-btn',
              type: 'Button',
              props: { label: 'Rotate' },
              interactions: [
                {
                  trigger: 'onClick',
                  action: 'tool:rotate',
                  description: 'Rotate now',
                },
              ],
            },
          ],
        },
        bindings: [
          {
            id: 'binding-rotate',
            componentId: 'rotate-btn',
            actionMatch: 'tool:rotate',
            action: {
              type: 'tool_call',
              toolId: 'rotate',
              args: {
                request: { $event: 'semanticDescription' },
              },
              resultPatches: [
                {
                  targetId: 'status',
                  propName: 'content',
                  value: { $result: 'message' },
                },
              ],
            },
          },
        ],
      };

      applyViewPlan(plan);
    }, 0);

    return () => {
      clearTimeout(timer);
      unregister();
    };
  }, [applyViewPlan, registerTool]);

  return (
    <AdaptiveRenderer
      spec={viewState.currentSpec ?? viewState.candidateSpec}
      onInteraction={(componentName, record, measurementHint) => {
        handleUserInteraction(
          {
            ...record,
            componentName,
            timestamp: Date.now(),
          },
          measurementHint
        ).then((records) => {
          if (props?.onInteractionExecuted) {
            props.onInteractionExecuted({
              durationMs: records.reduce((acc, r) => acc + (r.durationMs || 0), 0),
              records,
            });
          }
        });
      }}
    />
  );
}

describe('view runtime integration', () => {
  it('executes native binding actions through AdaptiveRenderer', async () => {
    render(
      <AnyaProvider components={builtInPrimitives}>
        <RuntimeHarness />
      </AnyaProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rotate')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Rotate'));

    await waitFor(() => {
      expect(screen.getByText('done:Rotate now')).toBeTruthy();
    });
  });

  it('reports interaction execution metrics to renderer callback', async () => {
    const events: Array<{ durationMs: number; records: number }> = [];

    render(
      <AnyaProvider components={builtInPrimitives}>
        <RuntimeHarness
          onInteractionExecuted={(input) => {
            events.push({
              durationMs: input.durationMs,
              records: input.records.length,
            });
          }}
        />
      </AnyaProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Rotate')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Rotate'));

    await waitFor(() => {
      expect(events.length).toBeGreaterThan(0);
    });

    expect(events[0].records).toBeGreaterThan(0);
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
  });

  it('hydrates session state and persistent profile into view context', async () => {
    const storage = new TestStorage({
      'anya.md': '# Persisted Profile\n\n- prefers concise cards',
      'memory.snapshot.json': JSON.stringify({
        version: 0,
        context: {
          userIntent: 'Restored intent',
          workflowContext: 'restore',
        },
        interactions: [
          {
            timestamp: 100,
            elementId: 'persist-text',
            componentName: 'Text',
            action: 'custom',
            semanticDescription: 'Viewed restored card',
          },
        ],
        elementHistories: [],
        reasoningTraces: [],
        currentSpec: {
          spec_version: 1,
          layout: 'stack',
          components: [
            {
              id: 'persist-text',
              type: 'Text',
              props: { content: 'Restored' },
            },
          ],
        },
      }),
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider components={builtInPrimitives} storage={storage}>
        {children}
      </AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.viewState.context.persistentProfile).toContain('Persisted Profile');
    });
    await waitFor(() => {
      expect(result.current.viewState.currentSpec?.components[0].id).toBe('persist-text');
    });
    await waitFor(() => {
      expect(result.current.runtimeState.ui.spec?.components[0].id).toBe('persist-text');
    });

    expect(result.current.viewState.currentSpec?.components[0].id).toBe('persist-text');
    expect(result.current.viewState.context.sessionHistory?.[0].semanticDescription)
      .toBe('Viewed restored card');
    expect(result.current.runtimeState.ui.spec?.components[0].id).toBe('persist-text');
  });
});
