import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface ProgressBarProps extends PrimitiveBehaviorProps {
    value: number;
    max?: number;
    label?: string;
    variant?: 'default' | 'success' | 'warning' | 'error';
    showValue?: boolean;
}

export const ProgressBar = defineComponent({
    name: 'ProgressBar',
    description: 'A horizontal progress bar showing completion (0-100).',
    propsSchema: z.object({
        value: z.number().min(0),
        max: z.number().optional(),
        label: z.string().optional(),
        variant: z.enum(['default', 'success', 'warning', 'error']).optional(),
        showValue: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'progress'],
    render: ({ id, props }: PrimitiveRenderProps<ProgressBarProps>) => {
        const max = props.max ?? 100;
        const pct = Math.min(100, Math.max(0, (props.value / max) * 100));
        return (
            <div id={id} className={`anya-progress ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
                {props.label && <div className="anya-progress-label">{props.label}</div>}
                <div className="anya-progress-track" role="progressbar" aria-valuenow={props.value} aria-valuemin={0} aria-valuemax={max}>
                    <div className={`anya-progress-fill anya-progress-${props.variant ?? 'default'}`} style={{ width: `${pct}%` }} />
                </div>
                {props.showValue && <div className="anya-progress-value">{Math.round(pct)}%</div>}
            </div>
        );
    },
});
