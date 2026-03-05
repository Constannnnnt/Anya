import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface RadioButtonProps extends PrimitiveBehaviorProps {
    options: Array<{ label: string; value: string }>;
    value?: string;
    name?: string;
    label?: string;
    disabled?: boolean;
}

export const RadioButton = defineComponent({
    name: 'RadioButton',
    description: 'A radio button group for single-choice selection.',
    propsSchema: z.object({
        options: z.array(z.object({ label: z.string(), value: z.string() })),
        value: z.string().optional(),
        name: z.string().optional(),
        label: z.string().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'radio'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<RadioButtonProps>) => {
        const [selected, setSelected] = useState(props.value ?? '');
        const groupName = props.name ?? id;
        return (
            <fieldset id={id} className={`anya-radio-group ${props.className || ''}`} style={props.style}>
                {props.label && <legend className="anya-radio-legend">{props.label}</legend>}
                {(props.options ?? []).map((opt) => (
                    <label key={opt.value} className={`anya-radio-option ${selected === opt.value ? 'anya-radio-selected' : ''} ${props.disabled ? 'anya-radio-disabled' : ''}`}>
                        <input
                            type="radio"
                            name={groupName}
                            value={opt.value}
                            checked={selected === opt.value}
                            disabled={props.disabled}
                            className="anya-radio-input"
                            onChange={() => {
                                setSelected(opt.value);
                                onInteraction('value_change', {
                                    propName: 'value',
                                    previousValue: selected,
                                    newValue: opt.value,
                                    semanticDescription: `User selected "${opt.label}"`,
                                });
                            }}
                        />
                        <span className="anya-radio-label">{opt.label}</span>
                    </label>
                ))}
            </fieldset>
        );
    },
});
