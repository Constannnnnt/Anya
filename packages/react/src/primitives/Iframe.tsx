import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { sanitizeUrl, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface IframeProps extends PrimitiveBehaviorProps {
    src: string;
    width?: string;
    height?: string;
    allow?: string;
    sandbox?: string;
    referrerPolicy?: React.HTMLAttributeReferrerPolicy;
    allowFullScreen?: boolean;
    loading?: 'lazy' | 'eager';
}

function normalizeYoutubeSrc(src: string): string {
    const youtubeRegex = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?/]+)/;
    const match = src.match(youtubeRegex);
    if (match) {
        const videoId = match[1];
        return `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;
    }
    return src;
}

export const Iframe = defineComponent({
    name: 'Iframe',
    description: 'An iframe element for embedding external content (YouTube, Vimeo, external websites). For local/self-hosted video files, use Video instead.',
    propsSchema: z.object({
        src: z.string(),
        width: z.string().optional(),
        height: z.string().optional(),
        allow: z.string().optional(),
        sandbox: z.string().optional(),
        referrerPolicy: z.string().optional(),
        allowFullScreen: z.boolean().optional(),
        loading: z.enum(['lazy', 'eager']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['media', 'iframe', 'embed'],
    examples: [
        'type: Iframe\n  props:\n    src: "https://www.youtube.com/embed/dQw4w9WgXcQ"\n    loading: "lazy"',
        'type: Iframe\n  props:\n    src: "https://player.vimeo.com/video/123456789"\n    width: "100%"\n    height: "400"',
    ],
    render: ({ id, props }: PrimitiveRenderProps<IframeProps>) => {
        const sanitizedSrc = sanitizeUrl(props.src) ?? 'about:blank';
        const src = normalizeYoutubeSrc(sanitizedSrc);
        return (
            <iframe
                id={id}
                src={src}
                width={props.width || '100%'}
                height={props.height || '400'}
                allow={props.allow || 'encrypted-media; picture-in-picture'}
                sandbox={props.sandbox || 'allow-scripts allow-presentation'}
                referrerPolicy={props.referrerPolicy || 'no-referrer'}
                allowFullScreen={props.allowFullScreen ?? true}
                loading={props.loading || 'lazy'}
                className={`anya-iframe ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            />
        );
    }
});
