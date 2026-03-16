import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    resolveRenderableMediaUrl,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface ImageProps extends PrimitiveBehaviorProps {
    src: string;
    alt?: string;
    width?: string;
    height?: string;
}

export const Image = defineComponent({
    name: 'Image',
    description: 'An image element.',
    propsSchema: z.object({
        src: z.string(),
        alt: z.string().optional(),
        width: z.string().optional(),
        height: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['media', 'image'],
    render: ({ id, props }: PrimitiveRenderProps<ImageProps>) => (
        <img
            id={id}
            src={resolveRenderableMediaUrl(props.src) ?? 'about:blank'}
            alt={props.alt}
            width={props.width}
            height={props.height}
            loading="lazy"
            decoding="async"
            className={`anya-img ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        />
    )
});
