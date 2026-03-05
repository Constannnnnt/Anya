import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import { sanitizeUrl, type PrimitiveBehaviorProps, type PrimitiveRenderProps } from './shared';

interface AvatarProps extends PrimitiveBehaviorProps {
    src?: string;
    alt?: string;
    initials?: string;
    size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const Avatar = defineComponent({
    name: 'Avatar',
    description: 'A circular avatar for user/entity identity. Shows an image or initials fallback.',
    propsSchema: z.object({
        src: z.string().optional(),
        alt: z.string().optional(),
        initials: z.string().optional(),
        size: z.enum(['sm', 'md', 'lg', 'xl']).optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['content', 'avatar'],
    render: ({ id, props }: PrimitiveRenderProps<AvatarProps>) => {
        const size = props.size ?? 'md';
        return (
            <div id={id}
                className={`anya-avatar anya-avatar-${size} ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                {props.src ? (
                    <img src={sanitizeUrl(props.src)} alt={props.alt || ''} className="anya-avatar-img" />
                ) : (
                    <span className="anya-avatar-initials">{props.initials || '?'}</span>
                )}
            </div>
        );
    },
});
