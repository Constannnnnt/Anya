import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface StepperProps extends PrimitiveBehaviorProps {
    steps: string[];
    currentStep?: number;
    direction?: 'horizontal' | 'vertical';
}

export const Stepper = defineComponent({
    name: 'Stepper',
    description: 'A multi-step wizard indicator showing progress through a sequence of steps.',
    propsSchema: z.object({
        steps: z.array(z.string()),
        currentStep: z.number().optional(),
        direction: z.enum(['horizontal', 'vertical']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['navigation', 'stepper'],
    render: ({ id, props }: PrimitiveRenderProps<StepperProps>) => {
        const current = props.currentStep ?? 0;
        const direction = props.direction ?? 'horizontal';
        return (
            <div id={id} className={`anya-stepper anya-stepper-${direction} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
                {(props.steps ?? []).map((step, i) => (
                    <div key={i} className={`anya-stepper-step ${i < current ? 'completed' : ''} ${i === current ? 'active' : ''} ${i > current ? 'upcoming' : ''}`}>
                        <div className="anya-stepper-indicator">{i < current ? '✓' : i + 1}</div>
                        <div className="anya-stepper-label">{step}</div>
                        {i < (props.steps ?? []).length - 1 && <div className="anya-stepper-connector" />}
                    </div>
                ))}
            </div>
        );
    },
});
