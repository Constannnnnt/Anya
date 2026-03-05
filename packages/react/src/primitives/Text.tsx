import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TextProps extends PrimitiveBehaviorProps {
    content: string;
    muted?: boolean;
}

export const Text = defineComponent({
    name: 'Text',
    description: 'A paragraph of text content.',
    propsSchema: z.object({
        content: z.string(),
        muted: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'text'],
    examples: [
        'type: Text\nprops:\n  content: This is some descriptive text.\n  muted: true',
    ],
    render: ({ id, props }: PrimitiveRenderProps<TextProps>) => (
        <p id={id}
            className={`anya-text ${props.muted ? 'anya-text-muted' : ''} ${props.dynamicInteractions ? 'anya-interactive' : ''} ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        >
            {props.content}
        </p>
    ),
});
