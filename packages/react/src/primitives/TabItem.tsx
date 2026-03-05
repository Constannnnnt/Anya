import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TabItemProps extends PrimitiveBehaviorProps {
    label: string;
}

export const TabItem = defineComponent({
    name: 'TabItem',
    description: 'A single tab pane inside a Tabs container. The label prop appears in the tab bar.',
    propsSchema: z.object({
        label: z.string(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'tabs'],
    render: ({ id, props, children }: PrimitiveRenderProps<TabItemProps>) => (
        <div id={id} className={`anya-tab-item ${props.className || ''}`} style={props.style}>
            {children}
        </div>
    ),
});
