import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface DividerProps extends PrimitiveBehaviorProps { label?: string; }

export const Divider = defineComponent({
    name: 'Divider',
    description: 'A horizontal divider/separator line.',
    propsSchema: z.object({
        label: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout'],
    render: ({ id, props }: PrimitiveRenderProps<DividerProps>) => (
        <div id={id} className={`anya-divider ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
            {props.label && <span className="anya-divider-label">{props.label}</span>}
        </div>
    ),
});
