import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface BadgeProps extends PrimitiveBehaviorProps {
    text: string;
    variant?: 'default' | 'success' | 'warning' | 'error' | 'info' | 'outline' | 'secondary' | 'subtle';
}

export const Badge = defineComponent({
    name: 'Badge',
    description: 'A small label/tag for status or categories.',
    propsSchema: z.object({
        text: z.string(),
        variant: z.enum(['default', 'success', 'warning', 'error', 'info', 'outline', 'secondary', 'subtle']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'status'],
    render: ({ id, props }: PrimitiveRenderProps<BadgeProps>) => (
        <span id={id}
            className={`anya-badge anya-badge-${props.variant ?? 'default'} ${props.dynamicInteractions ? 'anya-interactive' : ''} ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        >
            {props.text}
        </span>
    ),
});
