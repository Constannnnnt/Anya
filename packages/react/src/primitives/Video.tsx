import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { sanitizeUrl, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface VideoProps extends PrimitiveBehaviorProps {
    src: string;
    controls?: boolean;
    autoPlay?: boolean;
    loop?: boolean;
    width?: string;
    crossOrigin?: 'anonymous' | 'use-credentials';
}

export const Video = defineComponent({
    name: 'Video',
    description: 'A video player element for local/self-hosted video files (MP4, WebM, etc). For external/online videos (YouTube, Vimeo, etc), use Iframe instead.',
    propsSchema: z.object({
        src: z.string(),
        controls: z.boolean().optional(),
        autoPlay: z.boolean().optional(),
        loop: z.boolean().optional(),
        width: z.string().optional(),
        crossOrigin: z.enum(['anonymous', 'use-credentials']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['media', 'video'],
    examples: [
        'type: Video\n  props:\n    src: "/videos/intro.mp4"\n    controls: true\n    autoPlay: false',
        'type: Video\n  props:\n    src: "https://cdn.example.com/video.webm"\n    loop: true\n    width: "100%"',
    ],
    render: ({ id, props }: PrimitiveRenderProps<VideoProps>) => (
        <video id={id} src={sanitizeUrl(props.src)} controls={props.controls ?? true}
            autoPlay={props.autoPlay}
            loop={props.loop}
            width={props.width || '100%'}
            crossOrigin={props.crossOrigin}
            className={`anya-video ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        />
    )
});
