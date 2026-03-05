import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface IconProps extends PrimitiveBehaviorProps {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    color?: string;
}

export const Icon = defineComponent({
    name: 'Icon',
    description: 'A named icon. Uses Material Symbols or inline emoji/unicode characters.',
    propsSchema: z.object({
        name: z.string(),
        size: z.enum(['sm', 'md', 'lg']).optional(),
        color: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'icon'],
    render: ({ id, props }: PrimitiveRenderProps<IconProps>) => (
        <span id={id}
            className={`anya-icon anya-icon-${props.size ?? 'md'} material-symbols-outlined ${props.className || ''}`}
            style={{ color: props.color, ...props.style }}
            aria-hidden="true"
            {...props.dynamicInteractions}
        >
            {props.name}
        </span>
    ),
});
