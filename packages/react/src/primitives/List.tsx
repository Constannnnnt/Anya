import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface ListProps extends PrimitiveBehaviorProps { title?: string; ordered?: boolean; }

export const List = defineComponent({
    name: 'List',
    description: 'A list container. Nest ListItem children inside.',
    propsSchema: z.object({
        title: z.string().optional(),
        ordered: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'list'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<ListProps>) => (
        <div id={id} className={`anya-list ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            {props.title && (<div className="anya-list-title">{props.title}</div>)}
            <div className="anya-list-items">{children}</div>
        </div>
    ),
});
