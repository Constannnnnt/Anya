import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { AdaptiveRenderer } from '../src/AdaptiveRenderer';
import { defineComponent } from '../src/defineComponent';
import { z } from 'zod';
import type { UIRenderSpec } from '@anya-ui/core';

const TestBox = defineComponent({
    name: 'TestBox',
    description: 'A box',
    propsSchema: z.object({ title: z.string() }),
    render: ({ id, props, children, onInteraction, bindTo }) => (
        <div
            data-testid={id}
            data-dynamic={Object.keys(props.dynamicInteractions ?? {}).join(',')}
            data-bindto={(bindTo ?? []).join(',')}
        >
            <h2>{props.title}</h2>
            {children}
            <button onClick={() => onInteraction?.('custom', { semanticDescription: 'Clicked' })}>
                Click Me
            </button>
            {props.dynamicInteractions?.onClick && (
                <button data-testid={`dyn-${id}`} onClick={props.dynamicInteractions.onClick}>
                    Dynamic Click
                </button>
            )}
        </div>
    )
});

describe('AdaptiveRenderer', () => {
    const mockRegistry = {
        TestBox: TestBox.render
    };

    it('returns null if no spec is provided', () => {
        const { container } = render(<AdaptiveRenderer spec={null} />);
        expect(container.firstChild).toBeNull();
    });

    it('renders a fallback for unknown components', () => {
        const spec: UIRenderSpec = {
            layout: 'stack',
            components: [
                { id: '1', type: 'UnknownThing', props: {} }
            ]
        };

        render(<AdaptiveRenderer spec={spec} registry={{}} />);
        expect(screen.getByText('Unknown component:')).toBeInTheDocument();
    });

    it('recursively renders actual components from a manual registry', () => {
        const spec: UIRenderSpec = {
            layout: 'stack',
            components: [
                {
                    id: 'parent',
                    type: 'TestBox',
                    props: { title: 'Parent Box' },
                    children: [
                        {
                            id: 'child',
                            type: 'TestBox',
                            props: { title: 'Child Box' }
                        }
                    ]
                }
            ]
        };

        render(<AdaptiveRenderer spec={spec} registry={mockRegistry} />);

        expect(screen.getByTestId('parent')).toBeInTheDocument();
        expect(screen.getByTestId('child')).toBeInTheDocument();
        expect(screen.getByText('Parent Box')).toBeInTheDocument();
        expect(screen.getByText('Child Box')).toBeInTheDocument();
    });

    it('applies row and split root layout styles', () => {
        const rowSpec: UIRenderSpec = {
            layout: 'row',
            components: [{ id: 'row-1', type: 'TestBox', props: { title: 'Row Box' } }],
        };
        const splitSpec: UIRenderSpec = {
            layout: 'split',
            components: [
                { id: 'split-1', type: 'TestBox', props: { title: 'Left Pane' } },
                { id: 'split-2', type: 'TestBox', props: { title: 'Right Pane' } },
            ],
        };

        const { container, rerender } = render(<AdaptiveRenderer spec={rowSpec} registry={mockRegistry} />);
        const rowRoot = container.firstElementChild as HTMLElement;
        expect(rowRoot.dataset.anyaLayout).toBe('row');
        expect(rowRoot.style.display).toBe('flex');
        expect(rowRoot.style.flexDirection).toBe('row');

        rerender(<AdaptiveRenderer spec={splitSpec} registry={mockRegistry} />);
        const splitRoot = container.firstElementChild as HTMLElement;
        expect(splitRoot.dataset.anyaLayout).toBe('split');
        expect(splitRoot.style.display).toBe('grid');
    });

    it('handles interaction bubbling correctly', () => {
        const onInteractionSpy = vi.fn();
        const spec: UIRenderSpec = {
            layout: 'stack',
            components: [
                { id: 'target', type: 'TestBox', props: { title: 'Interactive Box' } }
            ]
        };

        render(
            <AdaptiveRenderer
                spec={spec}
                registry={mockRegistry}
                onInteraction={onInteractionSpy}
            />
        );

        fireEvent.click(screen.getByText('Click Me'));

        expect(onInteractionSpy).toHaveBeenCalledWith('TestBox', expect.objectContaining({
            elementId: 'target',
            action: 'custom',
            semanticDescription: 'Clicked'
        }));
    });

    it('wires up dynamic interactions attached by the agent', () => {
        const onInteractionSpy = vi.fn();
        const spec: UIRenderSpec = {
            layout: 'stack',
            components: [
                {
                    id: 'dyn-target',
                    type: 'TestBox',
                    props: { title: 'Dynamic Box' },
                    bindTo: ['label-1'],
                    interactions: [
                        { trigger: 'onClick', action: 'submit', description: 'Dynamically clicked', targetIds: ['some-video'], targetAction: 'play' }
                    ]
                }
            ]
        };

        render(
            <AdaptiveRenderer
                spec={spec}
                registry={mockRegistry}
                onInteraction={onInteractionSpy}
            />
        );

        const dynamicButton = screen.getByTestId('dyn-dyn-target');
        fireEvent.click(dynamicButton);
        expect(screen.getByTestId('dyn-target')).toHaveAttribute('data-bindto', 'label-1');

        expect(onInteractionSpy).toHaveBeenCalledWith('TestBox', expect.objectContaining({
            elementId: 'dyn-target',
            action: 'submit',
            trigger: 'onClick',
            semanticDescription: 'Dynamically clicked',
            targetIds: ['some-video'],
            targetAction: 'play'
        }));
    });

    it('executes all interactions sharing the same trigger in order', () => {
        const onInteractionSpy = vi.fn();
        const spec: UIRenderSpec = {
            layout: 'stack',
            components: [
                {
                    id: 'multi-target',
                    type: 'TestBox',
                    props: { title: 'Multi Trigger Box' },
                    interactions: [
                        { trigger: 'onClick', action: 'submit', description: 'First' },
                        { trigger: 'onClick', action: 'custom', description: 'Second' },
                    ]
                }
            ]
        };

        render(
            <AdaptiveRenderer
                spec={spec}
                registry={mockRegistry}
                onInteraction={onInteractionSpy}
            />
        );

        fireEvent.click(screen.getByTestId('dyn-multi-target'));

        expect(onInteractionSpy).toHaveBeenCalledTimes(2);
        expect(onInteractionSpy.mock.calls[0][1]).toEqual(expect.objectContaining({
            action: 'submit',
            trigger: 'onClick',
            semanticDescription: 'First',
        }));
        expect(onInteractionSpy.mock.calls[1][1]).toEqual(expect.objectContaining({
            action: 'custom',
            trigger: 'onClick',
            semanticDescription: 'Second',
        }));
    });

    it('skips re-rendering unchanged branches when spec references stay stable', () => {
        const renders: Record<string, number> = {};
        const Probe: React.FC<any> = ({ id, props }) => {
            renders[id] = (renders[id] ?? 0) + 1;
            return <div data-testid={id}>{props.title}</div>;
        };

        const registry = { Probe };
        const componentA1 = { id: 'a', type: 'Probe', props: { title: 'A1' } };
        const componentA2 = { id: 'a', type: 'Probe', props: { title: 'A2' } };
        const componentB = { id: 'b', type: 'Probe', props: { title: 'B' } };

        const spec1: UIRenderSpec = {
            layout: 'stack',
            components: [componentA1, componentB],
        };

        const { rerender } = render(<AdaptiveRenderer spec={spec1} registry={registry} />);
        expect(renders.a).toBe(1);
        expect(renders.b).toBe(1);

        const spec2: UIRenderSpec = {
            layout: 'stack',
            components: [componentA2, componentB],
        };

        rerender(<AdaptiveRenderer spec={spec2} registry={registry} />);
        expect(renders.a).toBe(2);
        expect(renders.b).toBe(1);
    });
});
