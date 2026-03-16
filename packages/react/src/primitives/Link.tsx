import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { sanitizeNavigationUrl, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface LinkProps extends PrimitiveBehaviorProps {
    text: string;
    href: string;
    external?: boolean;
}

export const Link = defineComponent({
    name: 'Link',
    description: 'A styled hyperlink. Set external=true to open in a new tab.',
    propsSchema: z.object({
        text: z.string(),
        href: z.string(),
        external: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'link', 'navigation'],
    render: ({ id, props }: PrimitiveRenderProps<LinkProps>) => (
        <a id={id}
            href={sanitizeNavigationUrl(props.href)}
            className={`anya-link ${props.external ? 'anya-link-external' : ''} ${props.className || ''}`}
            style={props.style}
            {...(props.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            {...props.dynamicInteractions}
        >
            {props.text}
            {props.external && <span className="anya-link-external-icon" aria-hidden="true"> ↗</span>}
        </a>
    ),
});
