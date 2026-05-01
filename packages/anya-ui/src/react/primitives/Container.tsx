import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface ContainerProps extends PrimitiveBehaviorProps { }

export const Container = defineComponent({
    name: 'Container',
    description: 'A basic layout box. Can hold children.',
    propsSchema: z.object({
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'box'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<ContainerProps>) => (
        <div id={id}
            className={`anya-container ${props.draggable ? 'anya-draggable' : ''} ${props.className || ''}`}
            style={{
                width: '100%',
                ...props.style,
            }}
            {...props.dynamicInteractions}
            {...bindDrag(id, props, onInteraction)}
        >
            {children}
        </div>
    )
});
