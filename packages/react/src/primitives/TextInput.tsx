import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface TextInputProps extends PrimitiveBehaviorProps {
    placeholder?: string;
    value?: string;
    label?: string;
    disabled?: boolean;
}

export const TextInput = defineComponent({
    name: 'TextInput',
    description: 'A single-line text input field. Reports value changes via onInteraction.',
    propsSchema: z.object({
        placeholder: z.string().optional(),
        value: z.string().optional(),
        label: z.string().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<TextInputProps>) => {
        const [val, setVal] = useState(props.value ?? '');
        return (
            <div id={id} className={`anya-text-input-wrapper ${props.className || ''}`} style={props.style}>
                {props.label && <label className="anya-text-input-label" htmlFor={`${id}-input`}>{props.label}</label>}
                <input
                    id={`${id}-input`}
                    type="text"
                    className="anya-text-input"
                    placeholder={props.placeholder}
                    value={val}
                    disabled={props.disabled}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        setVal(newVal);
                        onInteraction('value_change', {
                            propName: 'value',
                            previousValue: val,
                            newValue: newVal,
                            semanticDescription: `User typed "${newVal}" into text input`,
                        });
                    }}
                    {...props.dynamicInteractions}
                />
            </div>
        );
    },
});
