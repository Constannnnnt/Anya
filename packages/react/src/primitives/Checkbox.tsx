import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface CheckboxProps extends PrimitiveBehaviorProps {
    label: string;
    checked?: boolean;
    disabled?: boolean;
}

export const Checkbox = defineComponent({
    name: 'Checkbox',
    description: 'A checkbox input with a label.',
    propsSchema: z.object({
        label: z.string(),
        checked: z.boolean().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'checkbox'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<CheckboxProps>) => {
        const [isChecked, setIsChecked] = useState(!!props.checked);
        return (
            <label id={id} className={`anya-checkbox ${isChecked ? 'anya-checkbox-checked' : ''} ${props.disabled ? 'anya-checkbox-disabled' : ''} ${props.className || ''}`} style={props.style}>
                <input
                    type="checkbox"
                    className="anya-checkbox-input"
                    checked={isChecked}
                    disabled={props.disabled}
                    onChange={() => {
                        const next = !isChecked;
                        setIsChecked(next);
                        onInteraction('value_change', {
                            propName: 'checked',
                            previousValue: isChecked,
                            newValue: next,
                            semanticDescription: `User ${next ? 'checked' : 'unchecked'} "${props.label}"`,
                        });
                    }}
                />
                <span className="anya-checkbox-label">{props.label}</span>
            </label>
        );
    },
});
