import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface SkeletonProps extends PrimitiveBehaviorProps {
    variant?: 'text' | 'circular' | 'rectangular';
    width?: string;
    height?: string;
    lines?: number;
}

export const Skeleton = defineComponent({
    name: 'Skeleton',
    description: 'A loading placeholder with pulse animation. Use variant to control shape.',
    propsSchema: z.object({
        variant: z.enum(['text', 'circular', 'rectangular']).optional(),
        width: z.string().optional(),
        height: z.string().optional(),
        lines: z.number().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'loading'],
    render: ({ id, props }: PrimitiveRenderProps<SkeletonProps>) => {
        const variant = props.variant ?? 'text';
        const lines = variant === 'text' ? (props.lines ?? 3) : 1;
        return (
            <div id={id} className={`anya-skeleton-wrapper ${props.className || ''}`}
                style={props.style} aria-hidden="true" {...props.dynamicInteractions}
            >
                {Array.from({ length: lines }, (_, i) => (
                    <div key={i}
                        className={`anya-skeleton anya-skeleton-${variant}`}
                        style={getSkeletonStyle(variant, props, i, lines)}
                    />
                ))}
            </div>
        );
    },
});

function getSkeletonStyle(
    variant: NonNullable<SkeletonProps['variant']>,
    props: SkeletonProps,
    index: number,
    lineCount: number,
): React.CSSProperties {
    if (variant === 'circular') {
        const size = props.width ?? '40px';
        return {
            width: size,
            height: size,
        };
    }

    const isLastTextLine = variant === 'text' && index === lineCount - 1;

    return {
        width: isLastTextLine ? '60%' : (props.width ?? '100%'),
        height: props.height ?? (variant === 'text' ? '1em' : '120px'),
    };
}
