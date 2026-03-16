import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { resolveEmbedSource, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

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

function resolveDefaultSandbox(src: string): string {
    try {
        const parsed = new URL(src, 'https://__anya_base__');
        if (
            parsed.hostname === 'www.youtube.com'
            || parsed.hostname === 'youtube.com'
            || parsed.hostname === 'www.youtube-nocookie.com'
            || parsed.hostname === 'player.vimeo.com'
        ) {
            return 'allow-scripts allow-same-origin allow-presentation';
        }
    } catch {
        return 'allow-scripts allow-presentation';
    }
    return 'allow-scripts allow-presentation';
}

export const Iframe = defineComponent({
    name: 'Iframe',
    description: 'An iframe element for non-video embedded content such as documents or trusted sites. Provider-hosted videos should open externally in this environment.',
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
        'type: Iframe\n  props:\n    src: "https://example.com/embed/widget"\n    loading: "lazy"',
        'type: Iframe\n  props:\n    src: "/docs/reference.html"\n    width: "100%"\n    height: "400"',
    ],
    render: ({ id, props }: PrimitiveRenderProps<IframeProps>) => {
        const embed = resolveEmbedSource(props.src);
        const iframe = (
            <iframe
                id={id}
                src={embed.embedUrl}
                width={props.width || '100%'}
                height={props.height || '400'}
                allow={props.allow || 'encrypted-media; picture-in-picture'}
                sandbox={props.sandbox || resolveDefaultSandbox(embed.embedUrl)}
                referrerPolicy={props.referrerPolicy || 'no-referrer'}
                allowFullScreen={props.allowFullScreen ?? true}
                loading={props.loading || 'lazy'}
                className={`anya-iframe ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            />
        );

        if (!embed.externalUrl) {
            return iframe;
        }

        return (
            <>
                {iframe}
                <a href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
                    Open externally
                </a>
            </>
        );
    }
});
