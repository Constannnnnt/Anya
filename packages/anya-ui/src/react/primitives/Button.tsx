import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface ButtonProps extends PrimitiveBehaviorProps {
    label?: string;
    text?: string;
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
    busy?: boolean;
}

export const Button = defineComponent({
    name: 'Button',
    description: 'A standard interactive button component.',
    propsSchema: z.object({
        label: z.string().optional(),
        text: z.string().optional(),
        variant: z.enum(['primary', 'secondary', 'danger', 'ghost', 'outline']).optional(),
        busy: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['interaction', 'button'],
    render: ({ id, props }: PrimitiveRenderProps<ButtonProps>) => (
        <button id={id}
            type="button"
            className={`anya-btn anya-btn-${props.variant ?? 'primary'} ${props.busy ? 'anya-btn-busy' : ''} ${props.className || ''}`}
            style={props.style}
            disabled={props.busy}
            aria-busy={props.busy}
            {...props.dynamicInteractions}
        >
            {props.busy && <span className="anya-btn-spinner" aria-hidden="true" />}
            {props.text || props.label}
        </button>
    )
});
