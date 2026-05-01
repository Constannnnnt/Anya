import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface QuoteProps extends PrimitiveBehaviorProps {
    text: string;
    cite?: string;
    author?: string;
}

export const Quote = defineComponent({
    name: 'Quote',
    description: 'A blockquote for cited text with optional author attribution.',
    propsSchema: z.object({
        text: z.string(),
        cite: z.string().optional(),
        author: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'quote'],
    render: ({ id, props }: PrimitiveRenderProps<QuoteProps>) => (
        <blockquote id={id} className={`anya-quote ${props.className || ''}`} style={props.style}
            cite={props.cite} {...props.dynamicInteractions}
        >
            <p className="anya-quote-text">{props.text}</p>
            {props.author && <footer className="anya-quote-author">— {props.author}</footer>}
        </blockquote>
    ),
});
