import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface AccordionProps extends PrimitiveBehaviorProps { }

export const Accordion = defineComponent({
    name: 'Accordion',
    description: 'A container for expandable/collapsible AccordionItems.',
    propsSchema: z.object({
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'accordion'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<AccordionProps>) => (
        <div id={id} className={`anya-accordion ${props.draggable ? 'anya-draggable' : ''} ${props.className || ''}`} style={props.style} {...props.dynamicInteractions} {...bindDrag(id, props, onInteraction)}>
            {children}
        </div>
    )
});
