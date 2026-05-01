import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';
import { renderIconToken } from './iconResolver';

interface IconProps extends PrimitiveBehaviorProps {
    name: string;
    size?: 'sm' | 'md' | 'lg';
    color?: string;
}

export const Icon = defineComponent({
    name: 'Icon',
    description: 'A named icon. Uses Lucide icons or inline emoji/unicode characters.',
    propsSchema: z.object({
        name: z.string(),
        size: z.enum(['sm', 'md', 'lg']).optional(),
        color: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'icon'],
    render: ({ id, props }: PrimitiveRenderProps<IconProps>) => (
        <span
            id={id}
            style={props.style}
            {...props.dynamicInteractions}
        >
            {renderIconToken(props.name, {
                className: props.className,
                color: props.color,
                size: props.size,
            })}
        </span>
    ),
});
