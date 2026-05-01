import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';
import { renderIconToken } from './iconResolver';

interface ListItemProps extends PrimitiveBehaviorProps { text: string; icon?: string; }

export const ListItem = defineComponent({
    name: 'ListItem',
    description: 'A single item in a List.',
    propsSchema: z.object({
        text: z.string(),
        icon: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'list'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<ListItemProps>) => (
        <div id={id} className={`anya-list-item ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            {props.icon && renderIconToken(props.icon, { className: 'anya-list-icon', size: 'sm' })}
            <span>{props.text}</span>
        </div>
    ),
});
