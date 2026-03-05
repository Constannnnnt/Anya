import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface TimelineItemProps extends PrimitiveBehaviorProps { date: string; title: string; description?: string; icon?: string; }

export const TimelineItem = defineComponent({
    name: 'TimelineItem',
    description: 'A single event in a Timeline. Can contain nested children.',
    propsSchema: z.object({
        date: z.string(),
        title: z.string(),
        description: z.string().optional(),
        icon: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'timeline'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<TimelineItemProps>) => (
        <div id={id} className={`anya-timeline-item ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            <div className="anya-timeline-dot">{props.icon ?? '●'}</div>
            <div className="anya-timeline-content">
                <div className="anya-timeline-date">{props.date}</div>
                <div className="anya-timeline-item-title">{props.title}</div>
                {props.description && (<div className="anya-timeline-desc">{props.description}</div>)}
                {children && <div className="anya-timeline-children">{children}</div>}
            </div>
        </div>
    ),
});
