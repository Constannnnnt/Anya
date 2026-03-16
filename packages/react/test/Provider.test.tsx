import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, act } from '@testing-library/react';
import React from 'react';
import { AnyaProvider, useAnyaContext } from '../src/Provider';
import {
  createBehaviorFinding,
  createRuntimeEvent,
  getLogger,
  setLogger,
  silentLogger,
  type BehaviorAnalyzer,
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

    it('emits behavior analysis captures through the provider hook', async () => {
        const onBehaviorAnalysisRun = vi.fn();
        const behaviorAnalyzer: BehaviorAnalyzer = {
            id: 'provider_behavior_reflection',
            dependencies: ['aggregates'],
            cadence: 'rollup',
            minInteractions: 1,
            run: async ({ actorId, now }) => ({
                findings: [
                    createBehaviorFinding({
                        actorId,
                        analyzerId: 'provider_behavior_reflection',
                        kind: 'reflection_candidate',
                        conceptKey: 'provider-reflection:compare',
                        scopeKey: 'context:compare',
                        confidence: 0.95,
                        support: 1,
                        evidenceRefs: ['agg-1'],
                        payload: {
                            title: 'Provider Behavior Reflection',
                            hints: 'Observed compare behavior.',
                            useCases: 'Compare contexts.',
                        },
                        createdTs: now,
                    }),
                ],
            }),
        };

        const wrapper = ({ children }: { children: React.ReactNode }) => (
            <AnyaProvider
                components={mockComponents}
                onBehaviorAnalysisRun={onBehaviorAnalysisRun}
                uiMemory={{
                    enabled: true,
                    actorId: 'actor-provider',
                    triggerConfig: { debounceMs: 0 },
                    behavior: {
                        enabled: true,
                        analyzers: [behaviorAnalyzer],
                        interpreterPolicy: {
                            mode: 'calibration_required',
                            allowResolvedMemoryPromotion: true,
                            diagnosticConfidenceMin: 0.5,
                            localAdaptationConfidenceMin: 0.75,
                            localAdaptationSeverityMin: 'high',
                            allowedKindsByAnalyzer: {
                                provider_behavior_reflection: ['reflection_candidate'],
                            },
                            promotionRules: {
                                reflection_candidate: { confidenceMin: 0.7, supportMin: 1 },
                            },
                        },
                        captureSnapshots: true,
                    },
                }}
            >
                {children}
            </AnyaProvider>
        );

        const { result } = renderHook(() => useAnyaContext(), { wrapper });

        await flushEffects();

        act(() => {
            result.current.runtime.dispatch(createRuntimeEvent('ui.presented', {
                surface: {
                    uiId: 'ui-provider',
                    surfaceHash: 'ui-provider',
                    layout: 'split',
                    workflowContext: 'analysis',
                    componentCount: 2,
                    interactiveCount: 1,
                    actionableCount: 1,
                    componentFamilies: ['input', 'layout'],
                    actionFamilies: ['activate'],
                },
            }, { source: 'system' }));
            result.current.runtime.dispatch(createRuntimeEvent('interaction.measured', {
                interactionEventId: 'evt-provider',
                elementId: 'btn-1',
                componentName: 'Button',
                action: 'submit',
                measurement: {
                    modality: 'pointer',
                    componentFamily: 'action',
                    actionFamily: 'activate',
                    choiceSetSize: 6,
                },
            }, { source: 'user' }));
            result.current.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'thinking' }, { source: 'system' }));
            result.current.runtime.dispatch(createRuntimeEvent('session.status_set', { status: 'idle' }, { source: 'system' }));
        });

        await flushEffects();
        await flushEffects();

        expect(onBehaviorAnalysisRun).toHaveBeenCalledWith(expect.objectContaining({
            actorId: 'actor-provider',
            integration: expect.objectContaining({
                promotedReflections: 1,
            }),
            behaviorSnapshot: expect.objectContaining({
                signals: expect.any(Array),
            }),
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
