import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TooltipProps extends PrimitiveBehaviorProps {
    text: string;
    position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip = defineComponent({
    name: 'Tooltip',
    description: 'A hover tooltip wrapper. Nest the trigger element as a child.',
    propsSchema: z.object({
        text: z.string(),
        position: z.enum(['top', 'bottom', 'left', 'right']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'tooltip'],
    render: ({ id, props, children }: PrimitiveRenderProps<TooltipProps>) => {
        const [visible, setVisible] = useState(false);
        return (
            <div id={id} className={`anya-tooltip-wrapper ${props.className || ''}`}
                style={{ position: 'relative', display: 'inline-block', ...props.style }}
                onMouseEnter={() => setVisible(true)}
                onMouseLeave={() => setVisible(false)}
                onFocus={() => setVisible(true)}
                onBlur={() => setVisible(false)}
            >
                {children}
                {visible && (
                    <div className={`anya-tooltip anya-tooltip-${props.position ?? 'top'}`} role="tooltip">
                        {props.text}
                    </div>
                )}
            </div>
        );
    },
});
