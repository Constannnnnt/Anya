import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import React from 'react';
import { AnyaProvider, useAnyaContext } from '../src/Provider';
import {
  createRuntimeEvent,
  getLogger,
  setLogger,
  silentLogger,
  type FileStorage,
  type Logger,
} from '@anya-ui/core';
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
const defaultLogger = getLogger();

const alternateComponents: AnyaComponent[] = [
    {
        name: 'Title',
        description: 'A second heading component',
        propsSchema: z.object({ text: z.string() }),
        render: ({ props }) => <h2>{props.text}</h2>
    }
];

const baseWorkflowContexts = [
    {
        name: 'profile_edit',
        description: 'Edit a user profile',
        components: ['Heading'],
    }
];

function createMemoryStorage(label: string): FileStorage {
    return {
        read: vi.fn().mockResolvedValue(null),
        write: vi.fn().mockResolvedValue(undefined),
    };
}

async function flushEffects(): Promise<void> {
    await act(async () => {
        await Promise.resolve();
    });
}

function installMockLogger() {
    const originalLogger = getLogger();
    const logger: Logger = {
        ...silentLogger,
        warn: vi.fn(),
    };
    setLogger(logger);
    return {
        warn: logger.warn as ReturnType<typeof vi.fn>,
        restore() {
            setLogger(originalLogger);
        },
    };
}

afterEach(() => {
    setLogger(defaultLogger);
});

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

    it('warns when mount-only provider props change after initialization', async () => {
        const { warn, restore } = installMockLogger();
        const storageA = createMemoryStorage('a');
        const storageB = createMemoryStorage('b');

        try {
            const { rerender } = render(
                <AnyaProvider
                    components={mockComponents}
                    workflowContexts={baseWorkflowContexts}
                    allowedCapabilities={['drag_drop']}
                    storage={storageA}
                >
                    <div>child</div>
                </AnyaProvider>
            );

            await flushEffects();

            rerender(
                <AnyaProvider
                    components={alternateComponents}
                    workflowContexts={[
                        {
                            name: 'gallery_review',
                            description: 'Review a media gallery',
                            components: ['Title'],
                        },
                    ]}
                    allowedCapabilities={['theme_mutation']}
                    storage={storageB}
                    uiMemory={{ enabled: true, actorId: 'actor-1' }}
                >
                    <div>child</div>
                </AnyaProvider>
            );

            await flushEffects();

            const warningMessages = warn.mock.calls.map((call) => String(call[0]));
            expect(warningMessages.some((message) => message.includes("'components' is mount-only"))).toBe(true);
            expect(warningMessages.some((message) => message.includes("'workflowContexts' is mount-only"))).toBe(true);
            expect(warningMessages.some((message) => message.includes("'allowedCapabilities' is mount-only"))).toBe(true);
            expect(warningMessages.some((message) => message.includes("'storage' is mount-only"))).toBe(true);
            expect(warningMessages.some((message) => message.includes("'uiMemory' is mount-only"))).toBe(true);
        } finally {
            restore();
        }
    });

    it('does not warn when mount-only props are recreated with equivalent values', async () => {
        const { warn, restore } = installMockLogger();

        try {
            const { rerender } = render(
                <AnyaProvider
                    components={[...mockComponents]}
                    workflowContexts={[...baseWorkflowContexts]}
                    allowedCapabilities={['drag_drop']}
                >
                    <div>child</div>
                </AnyaProvider>
            );

            await flushEffects();

            rerender(
                <AnyaProvider
                    components={[...mockComponents]}
                    workflowContexts={[...baseWorkflowContexts]}
                    allowedCapabilities={['drag_drop']}
                >
                    <div>child</div>
                </AnyaProvider>
            );

            await flushEffects();

            expect(warn).not.toHaveBeenCalled();
        } finally {
            restore();
        }
    });
});
