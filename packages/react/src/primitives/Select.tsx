import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface SelectProps extends PrimitiveBehaviorProps {
    options: Array<{ label: string; value: string }>;
    value?: string;
    placeholder?: string;
    label?: string;
    disabled?: boolean;
}

export const Select = defineComponent({
    name: 'Select',
    description: 'A dropdown select input. Provide options as an array of {label, value}.',
    propsSchema: z.object({
        options: z.array(z.object({ label: z.string(), value: z.string() })),
        value: z.string().optional(),
        placeholder: z.string().optional(),
        label: z.string().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'select'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<SelectProps>) => {
        const [val, setVal] = useState(props.value ?? '');
        return (
            <div id={id} className={`anya-select-wrapper ${props.className || ''}`} style={props.style}>
                {props.label && <label className="anya-select-label" htmlFor={`${id}-select`}>{props.label}</label>}
                <select
                    id={`${id}-select`}
                    className="anya-select"
                    value={val}
                    disabled={props.disabled}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        setVal(newVal);
                        onInteraction('value_change', {
                            propName: 'value',
                            previousValue: val,
                            newValue: newVal,
                            semanticDescription: `User selected "${newVal}"`,
                        });
                    }}
                >
                    {props.placeholder && <option value="" disabled>{props.placeholder}</option>}
                    {(props.options ?? []).map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            </div>
        );
    },
});
