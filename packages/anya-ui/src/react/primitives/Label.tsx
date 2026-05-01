import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface LabelProps extends PrimitiveBehaviorProps {
    text: string;
    htmlFor?: string;
    required?: boolean;
}

export const Label = defineComponent({
    name: 'Label',
    description: 'A semantic form label. Use htmlFor to associate with a form input.',
    propsSchema: z.object({
        text: z.string(),
        htmlFor: z.string().optional(),
        required: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'label'],
    render: ({ id, props }: PrimitiveRenderProps<LabelProps>) => (
        <label id={id}
            htmlFor={props.htmlFor}
            className={`anya-label ${props.required ? 'anya-label-required' : ''} ${props.className || ''}`}
            style={props.style}
            {...props.dynamicInteractions}
        >
            {props.text}
            {props.required && <span className="anya-label-asterisk" aria-hidden="true"> *</span>}
        </label>
    ),
});
