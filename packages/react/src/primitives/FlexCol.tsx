import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    bindDrag,
    resolveFlexAlign,
    resolveFlexJustify,
    toCssLength,
    type FlexAlign,
    type FlexJustify,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface FlexProps extends PrimitiveBehaviorProps {
    gap?: number | string;
    align?: FlexAlign;
    justify?: FlexJustify;
}

export const FlexCol = defineComponent({
    name: 'FlexCol',
    description: 'A vertical flex layout column. Nest children inside.',
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
            className={`anya-flex-col ${props.draggable ? 'anya-draggable' : ''} ${props.className || ''}`}
            style={{
                display: 'flex',
                flexDirection: 'column',
                width: '100%',
                gap: toCssLength(props.gap),
                alignItems: resolveFlexAlign(props.align),
                justifyContent: resolveFlexJustify(props.justify),
                ...props.style,
            }}
            {...props.dynamicInteractions}
            {...bindDrag(id, props, onInteraction)}
        >
            {children}
        </div>
    )
});
