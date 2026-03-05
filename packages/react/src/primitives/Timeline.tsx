import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface TimelineProps extends PrimitiveBehaviorProps { title?: string; direction?: 'vertical' | 'horizontal'; }

export const Timeline = defineComponent({
    name: 'Timeline',
    description: 'A timeline. Nest TimelineItem children inside.',
    propsSchema: z.object({
        title: z.string().optional(),
        direction: z.enum(['vertical', 'horizontal']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'timeline'],
    examples: [
        'type: Timeline\nprops:\n  title: My Journey\n  direction: horizontal\nchildren:\n  - type: TimelineItem\n    props:\n      date: "2020"\n      title: Started coding',
    ],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<TimelineProps>) => (
        <div id={id} className={`anya-timeline anya-timeline-${props.direction || 'vertical'} ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            {props.title && (<div className="anya-timeline-title">{props.title}</div>)}
            <div className="anya-timeline-track">{children}</div>
        </div>
    ),
});
