import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    resolveEmbedSource,
    resolveRenderableMediaUrl,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface VideoProps extends PrimitiveBehaviorProps {
    src: string;
    controls?: boolean;
    autoPlay?: boolean;
    loop?: boolean;
    width?: string;
    height?: string;
}

export const Video = defineComponent({
    name: 'Video',
    description: 'A video player element for direct media files (MP4, WebM, Ogg, etc). For YouTube/Vimeo and other provider pages, use a Link or Button that opens externally.',
    propsSchema: z.object({
        src: z.string(),
        controls: z.boolean().optional(),
        autoPlay: z.boolean().optional(),
        loop: z.boolean().optional(),
        width: z.string().optional(),
        height: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['media', 'video'],
    examples: [
        'type: Video\n  props:\n    src: "/videos/intro.mp4"\n    controls: true\n    autoPlay: false',
        'type: Video\n  props:\n    src: "https://cdn.example.com/video.webm"\n    loop: true\n    width: "100%"',
    ],
    render: ({ id, props }: PrimitiveRenderProps<VideoProps>) => {
        const embed = resolveEmbedSource(props.src);
        if (embed.provider) {
            return (
                <div
                    id={id}
                    className={`anya-video ${props.className || ''}`}
                    style={{
                        width: props.width || '100%',
                        minHeight: props.height || '220',
                        padding: '16px',
                        border: '1px solid var(--anya-border)',
                        borderRadius: 'var(--anya-radius-md)',
                        background: 'var(--anya-bg-glass)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center',
                        gap: '10px',
                        ...(props.style ?? {}),
                    }}
                    {...props.dynamicInteractions}
                >
                    <strong>{embed.provider === 'youtube' ? 'YouTube video' : 'Vimeo video'}</strong>
                    <span>Embedded playback is disabled in-app. Open the source directly.</span>
                    {embed.externalUrl && (
                        <a href={embed.externalUrl} target="_blank" rel="noopener noreferrer">
                            Open externally
                        </a>
                    )}
                </div>
            );
        }

        return (
            <video
                id={id}
                src={resolveRenderableMediaUrl(props.src) ?? 'about:blank'}
                controls={props.controls ?? true}
                autoPlay={props.autoPlay}
                loop={props.loop}
                width={props.width || '100%'}
                height={props.height}
                className={`anya-video ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            />
        );
    }
});
