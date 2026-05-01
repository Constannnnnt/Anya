import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';
import { renderIconToken } from './iconResolver';

interface EmptyStateProps extends PrimitiveBehaviorProps {
    title: string;
    description?: string;
    icon?: string;
}

export const EmptyState = defineComponent({
    name: 'EmptyState',
    description: 'A placeholder shown when there is no data. Typically has an icon, title, and description.',
    propsSchema: z.object({
        title: z.string(),
        description: z.string().optional(),
        icon: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'empty'],
    render: ({ id, props, children }: PrimitiveRenderProps<EmptyStateProps>) => (
        <div id={id} className={`anya-empty-state ${props.className || ''}`} style={props.style} {...props.dynamicInteractions}>
            {props.icon && <div className="anya-empty-state-icon">{renderIconToken(props.icon, { size: 'lg' })}</div>}
            <div className="anya-empty-state-title">{props.title}</div>
            {props.description && <div className="anya-empty-state-desc">{props.description}</div>}
            {children && <div className="anya-empty-state-actions">{children}</div>}
        </div>
    ),
});
