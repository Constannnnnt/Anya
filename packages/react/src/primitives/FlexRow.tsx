import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface FlexProps extends PrimitiveBehaviorProps {
    gap?: number | string;
    align?: 'start' | 'center' | 'end' | 'stretch';
    justify?: 'start' | 'center' | 'end' | 'between' | 'around';
}

export const FlexRow = defineComponent({
    name: 'FlexRow',
    description: 'A horizontal flex layout row. Nest children inside.',
    propsSchema: z.object({
        gap: z.union([z.number(), z.string()]).optional(),
        align: z.enum(['start', 'center', 'end', 'stretch']).optional(),
        justify: z.enum(['start', 'center', 'end', 'between', 'around']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'flex'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<FlexProps>) => (
        <div id={id}
            className={`anya-flex-row ${props.draggable ? 'anya-draggable' : ''} ${props.className || ''}`}
            style={{
                display: 'flex',
                flexDirection: 'row',
                flexWrap: 'wrap',
                width: '100%',
                gap: typeof props.gap === 'number' ? `${props.gap}px` : props.gap,
                alignItems: props.align === 'start' ? 'flex-start' : props.align === 'end' ? 'flex-end' : props.align,
                justifyContent: props.justify === 'start' ? 'flex-start' : props.justify === 'end' ? 'flex-end' : props.justify === 'between' ? 'space-between' : props.justify === 'around' ? 'space-around' : props.justify,
                ...props.style,
            }}
            {...props.dynamicInteractions}
            {...bindDrag(id, props, onInteraction)}
        >
            {children}
        </div>
    )
});
