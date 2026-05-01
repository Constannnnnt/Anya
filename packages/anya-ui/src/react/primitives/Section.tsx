import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface SectionProps extends PrimitiveBehaviorProps { title: string; description?: string; }

export const Section = defineComponent({
    name: 'Section',
    description: 'A labeled section grouping. Nest children inside.',
    propsSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'container'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<SectionProps>) => (
        <div id={id} className={`anya-section ${props.draggable ? 'anya-draggable' : ''} ${props.dynamicInteractions ? 'anya-interactive-container' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            <div className="anya-section-header">
                <div className="anya-section-title">{props.title}</div>
                {props.description && (<div className="anya-section-desc">{props.description}</div>)}
            </div>
            <div className="anya-section-body">{children}</div>
        </div>
    ),
});
