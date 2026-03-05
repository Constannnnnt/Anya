import { describe, it, expect, vi } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import React from 'react';
import { AnyaProvider, useAnyaContext } from '../src/Provider';
import { createRuntimeEvent } from '@anya-ui/core';
import { z } from 'zod';
import type { AnyaComponent } from '../src/defineComponent';

const mockComponents: AnyaComponent[] = [
    {
        name: 'Heading',
        description: 'A test heading component',
        propsSchema: z.object({ text: z.string() }),
        render: ({ props }) => <h1>{props.text}</h1>
    }
];

describe('AnyaProvider & useAnyaContext', () => {
    it('throws an error if useAnyaContext is used outside Provider', () => {
        // Suppress console.error from React about the unhandled runtime error in the hook
        const spy = vi.spyOn(console, 'error').mockImplementation(() => { });

        expect(() => {
            renderHook(() => useAnyaContext());
        }).toThrowError('useAnyaContext must be used within an <AnyaProvider>');

        spy.mockRestore();
    });

    it('provides the framework context when wrapped in AnyaProvider', () => {
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AnyaProvider components={mockComponents}>
                {children}
            </AnyaProvider>
        );

        const { result } = renderHook(() => useAnyaContext(), { wrapper });

        expect(result.current.catalog).toBeDefined();
        expect(result.current.memory).toBeDefined();
        expect(result.current.orchestrator).toBeDefined();
        expect(result.current.componentMap).toBeDefined();
        expect(result.current.componentMap.has('Heading')).toBe(true);
    });

    it('emits telemetry and failure budget signals through provider hooks', async () => {
        const onTelemetryEvent = vi.fn();
        const onFailureBudgetSignal = vi.fn();
        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AnyaProvider
                components={mockComponents}
                onTelemetryEvent={onTelemetryEvent}
                onFailureBudgetSignal={onFailureBudgetSignal}
                failureBudgetPolicy={{
                    name: 'provider_decode_slo',
                    windowSize: 3,
                    minSamples: 3,
                    thresholdRatio: 0.5,
                }}
            >
                {children}
            </AnyaProvider>
        );

        const { result } = renderHook(() => useAnyaContext(), { wrapper });

        await act(async () => {
            await Promise.resolve();
        });

        act(() => {
            result.current.runtime.dispatch(createRuntimeEvent('spec.decode_failed', { error: 'e1' }));
            result.current.runtime.dispatch(createRuntimeEvent('spec.decoded', {
                spec: { layout: 'stack', components: [] },
            }));
            result.current.runtime.dispatch(createRuntimeEvent('spec.decode_failed', { error: 'e2' }));
        });

        expect(onTelemetryEvent).toHaveBeenCalled();
        expect(onFailureBudgetSignal).toHaveBeenCalledTimes(1);
        expect(onFailureBudgetSignal).toHaveBeenCalledWith(expect.objectContaining({
            kind: 'runtime.failure_budget.exceeded',
            policyName: 'provider_decode_slo',
        }));
    });
});
