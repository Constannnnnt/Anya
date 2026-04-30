import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, render, fireEvent, screen } from '@testing-library/react';
import React from 'react';
import { z } from 'zod';
import type { ViewSpec } from '@anya-ui/core';
import { AnyaProvider } from '../src/Provider';
import { defineComponent } from '../src/defineComponent';
import { useAnyaUI } from '../src/hooks/useAnyaUI';
import { AdaptiveRenderer } from '../src/AdaptiveRenderer';

describe('plugin lifecycle integration', () => {
  it('runs register/unregister hooks for dynamically registered plugins', async () => {
    const onRegister = vi.fn();
    const onUnregister = vi.fn();
    const DynamicPlugin = defineComponent({
      name: 'DynamicPlugin',
      description: 'Dynamic plugin for lifecycle tests',
      propsSchema: z.object({ title: z.string() }),
      render: ({ props }) => <div>{props.title}</div>,
      onRegister,
      onUnregister,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider>{children}</AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });
    let unregister: (() => void) | undefined;

    act(() => {
      unregister = result.current.registerComponent(DynamicPlugin);
    });

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(result.current.context.componentMap.has('DynamicPlugin')).toBe(true);
    expect(result.current.context.pluginMap.has('DynamicPlugin')).toBe(true);

    act(() => {
      unregister?.();
    });

    expect(onUnregister).toHaveBeenCalledTimes(1);
    expect(result.current.context.componentMap.has('DynamicPlugin')).toBe(false);
    expect(result.current.context.pluginMap.has('DynamicPlugin')).toBe(false);
  });

  it('invokes plugin onInteraction hook during renderer interactions', () => {
    const onRegister = vi.fn();
    const onInteraction = vi.fn();
    const InteractionPlugin = defineComponent({
      name: 'InteractionPlugin',
      description: 'Plugin with interaction hook',
      propsSchema: z.object({ label: z.string() }),
      render: ({ props, onInteraction: emit }) => (
        <button
          data-testid="interaction-trigger"
          onClick={() => emit('custom', { semanticDescription: props.label })}
        >
          trigger
        </button>
      ),
      onRegister,
      onInteraction,
    });

    const spec: ViewSpec = {
      layout: 'stack',
      components: [
        {
          id: 'interaction-plugin-1',
          type: 'InteractionPlugin',
          props: { label: 'plugin clicked' },
        },
      ],
    };

    render(
      <AnyaProvider components={[InteractionPlugin]}>
        <AdaptiveRenderer spec={spec} />
      </AnyaProvider>
    );

    fireEvent.click(screen.getByTestId('interaction-trigger'));

    expect(onRegister).toHaveBeenCalledTimes(1);
    expect(onInteraction).toHaveBeenCalledTimes(1);
    expect(onInteraction).toHaveBeenCalledWith(expect.objectContaining({
      componentName: 'InteractionPlugin',
      action: 'custom',
      semanticDescription: 'plugin clicked',
      elementId: 'interaction-plugin-1',
    }));
  });

  it('enforces capability allowlist for plugin registration through useAnyaUI', async () => {
    const onRegister = vi.fn();
    const RestrictedPlugin = defineComponent({
      name: 'RestrictedPlugin',
      description: 'Needs forbidden capability',
      propsSchema: z.object({}),
      render: () => null,
      capabilities: ['theme_mutation'],
      onRegister,
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <AnyaProvider allowedCapabilities={['drag_drop']}>{children}</AnyaProvider>
    );

    const { result } = renderHook(() => useAnyaUI(), { wrapper });
    await act(async () => {
      await Promise.resolve();
    });

    expect(() => result.current.registerComponent(RestrictedPlugin)).toThrow(/disallowed capabilities/);

    expect(onRegister).toHaveBeenCalledTimes(0);
    expect(result.current.context.componentMap.has('RestrictedPlugin')).toBe(false);
    expect(result.current.context.pluginMap.has('RestrictedPlugin')).toBe(false);
  });
});

