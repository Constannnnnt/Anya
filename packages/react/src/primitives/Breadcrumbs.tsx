import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { sanitizeUrl, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface BreadcrumbsProps extends PrimitiveBehaviorProps {
    items: Array<{ label: string; href?: string }>;
    separator?: string;
}

export const Breadcrumbs = defineComponent({
    name: 'Breadcrumbs',
    description: 'A hierarchical navigation trail. The last item is the current page.',
    propsSchema: z.object({
        items: z.array(z.object({ label: z.string(), href: z.string().optional() })),
        separator: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['navigation', 'breadcrumbs'],
    render: ({ id, props }: PrimitiveRenderProps<BreadcrumbsProps>) => {
        const sep = props.separator ?? '/';
        const items = props.items ?? [];
        return (
            <nav id={id} className={`anya-breadcrumbs ${props.className || ''}`} aria-label="Breadcrumb"
                style={props.style} {...props.dynamicInteractions}
            >
                <ol className="anya-breadcrumbs-list">
                    {items.map((item, i) => (
                        <li key={i} className="anya-breadcrumb-item">
                            {i > 0 && <span className="anya-breadcrumb-sep" aria-hidden="true"> {sep} </span>}
                            {i < items.length - 1 && item.href ? (
                                <a href={sanitizeUrl(item.href)} className="anya-breadcrumb-link">{item.label}</a>
                            ) : (
                                <span className="anya-breadcrumb-current" aria-current="page">{item.label}</span>
                            )}
                        </li>
                    ))}
                </ol>
            </nav>
        );
    },
});
