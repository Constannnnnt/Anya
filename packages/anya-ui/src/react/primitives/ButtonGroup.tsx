import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface ButtonGroupProps extends PrimitiveBehaviorProps { }

export const ButtonGroup = defineComponent({
    name: 'ButtonGroup',
    description: 'A visually grouped set of buttons. Nest Button children inside.',
    propsSchema: z.object({
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'button'],
    render: ({ id, props, children }: PrimitiveRenderProps<ButtonGroupProps>) => (
        <div id={id} role="group" className={`anya-btn-group ${props.className || ''}`}
            style={props.style} {...props.dynamicInteractions}
        >
            {children}
        </div>
    ),
});
