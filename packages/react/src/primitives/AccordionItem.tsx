import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { bindDrag, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface AccordionItemProps extends PrimitiveBehaviorProps { title: string; defaultExpanded?: boolean; }

export const AccordionItem = defineComponent({
    name: 'AccordionItem',
    description: 'An individual expandable item inside an Accordion.',
    propsSchema: z.object({
        title: z.string(),
        defaultExpanded: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'accordion'],
    render: ({ id, props, children, onInteraction }: PrimitiveRenderProps<AccordionItemProps>) => {
        const [isExpanded, setIsExpanded] = useState(!!props.defaultExpanded);
        const handleToggle = (e: React.MouseEvent) => {
            e.stopPropagation();
            setIsExpanded(!isExpanded);
            if (props.dynamicInteractions && props.dynamicInteractions.onClick) {
                props.dynamicInteractions.onClick(e);
            }
        };
        return (
            <div id={id} className={`anya-accordion-item ${isExpanded ? 'active' : ''} ${props.draggable ? 'anya-draggable' : ''} ${props.className || ''}`} style={props.style} {...bindDrag(id, props, onInteraction)}>
                <button className="anya-accordion-trigger" onClick={handleToggle} aria-expanded={isExpanded}>
                    <span className="anya-accordion-title">{props.title}</span>
                    <span className={`anya-accordion-icon ${isExpanded ? 'open' : ''}`}>▼</span>
                </button>
                <div className={`anya-accordion-content ${isExpanded ? 'open' : ''}`}
                    style={{
                        maxHeight: isExpanded ? 'none' : '0px',
                        overflow: 'hidden',
                        padding: isExpanded ? 'var(--anya-space-4)' : '0 var(--anya-space-4)',
                        visibility: isExpanded ? 'visible' : 'hidden'
                    }}
                >
                    {children}
                </div>
            </div>
        );
    }
});
