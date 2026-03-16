import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface HeadingProps extends PrimitiveBehaviorProps {
    text: string;
    level?: number;
}

export const Heading = defineComponent({
    name: 'Heading',
    description: 'A heading/title. Use level 1-4 for hierarchy.',
    propsSchema: z.object({
        text: z.string(),
        level: z.number().min(1).max(4).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['layout', 'text'],
    examples: [
        'type: Heading\nprops:\n  text: My Timeline\n  level: 2',
    ],
    render: ({ id, props }: PrimitiveRenderProps<HeadingProps>) => {
        const level = props.level ?? 2;
        const Tag = getHeadingTag(level);
        return React.createElement(Tag, {
            id,
            className: `anya-heading anya-heading-${level} ${props.dynamicInteractions ? 'anya-interactive' : ''} ${props.className || ''}`,
            style: props.style,
            ...props.dynamicInteractions
        }, props.text);
    },
});

function getHeadingTag(level: number): 'h1' | 'h2' | 'h3' | 'h4' {
    switch (level) {
        case 1:
            return 'h1';
        case 2:
            return 'h2';
        case 3:
            return 'h3';
        default:
            return 'h4';
    }
}
