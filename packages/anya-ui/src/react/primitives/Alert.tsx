import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface AlertProps extends PrimitiveBehaviorProps {
    message: string;
    title?: string;
    variant?: 'info' | 'success' | 'warning' | 'error';
    dismissible?: boolean;
}

export const Alert = defineComponent({
    name: 'Alert',
    description: 'A status/info banner for displaying important messages. Use variant to control severity.',
    propsSchema: z.object({
        message: z.string(),
        title: z.string().optional(),
        variant: z.enum(['info', 'success', 'warning', 'error']).optional(),
        dismissible: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['feedback', 'alert'],
    examples: [
        'type: Alert\nprops:\n  message: Your changes have been saved.\n  variant: success',
    ],
    render: ({ id, props }: PrimitiveRenderProps<AlertProps>) => {
        const variant = props.variant ?? 'info';
        const icons: Record<string, string> = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' };
        return (
            <div id={id} role="alert"
                className={`anya-alert anya-alert-${variant} ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                <span className="anya-alert-icon" aria-hidden="true">{icons[variant]}</span>
                <div className="anya-alert-body">
                    {props.title && <div className="anya-alert-title">{props.title}</div>}
                    <div className="anya-alert-message">{props.message}</div>
                </div>
            </div>
        );
    },
});
