import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface SpinnerProps extends PrimitiveBehaviorProps {
    size?: 'sm' | 'md' | 'lg';
    label?: string;
}

export const Spinner = defineComponent({
    name: 'Spinner',
    description: 'A circular loading spinner indicator.',
    propsSchema: z.object({
        size: z.enum(['sm', 'md', 'lg']).optional(),
        label: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'loading'],
    render: ({ id, props }: PrimitiveRenderProps<SpinnerProps>) => (
        <div id={id} className={`anya-spinner anya-spinner-${props.size ?? 'md'} ${props.className || ''}`}
            role="status" style={props.style} {...props.dynamicInteractions}
        >
            <svg className="anya-spinner-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle className="anya-spinner-track" cx="12" cy="12" r="10" strokeWidth="3" />
                <circle className="anya-spinner-arc" cx="12" cy="12" r="10" strokeWidth="3" strokeDasharray="30 70" />
            </svg>
            {props.label && <span className="anya-spinner-label">{props.label}</span>}
        </div>
    ),
});
