import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface CardProps extends PrimitiveBehaviorProps {
    title?: string;
    subtitle?: string;
}

export const Card = defineComponent({
    name: 'Card',
    description: 'A container card with optional title. Nest children inside.',
    propsSchema: z.object({
        title: z.string().optional(),
        subtitle: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'container'],
    examples: [
        'type: Card\nprops:\n  title: About Me\nchildren:\n  - type: Text\n    props:\n      content: Hello world',
    ],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<CardProps>) => (
        <div id={id} className={`anya-card ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            {props.title && <div className="anya-card-title">{props.title}</div>}
            {props.subtitle && <div className="anya-card-subtitle">{props.subtitle}</div>}
            <div className="anya-card-body">{children}</div>
        </div>
    ),
});
