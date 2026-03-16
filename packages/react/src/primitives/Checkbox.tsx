import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    measureSelectionTarget,
    useSyncedState,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

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
        const [isChecked, setIsChecked] = useSyncedState(props.checked, false);
        return (
            <label
                id={id}
                className={`anya-checkbox ${isChecked ? 'anya-checkbox-checked' : ''} ${props.disabled ? 'anya-checkbox-disabled' : ''} ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                <input
                    type="checkbox"
                    className="anya-checkbox-input"
                    checked={isChecked}
                    disabled={props.disabled}
                    onChange={(e) => {
                        const next = !isChecked;
                        setIsChecked(next);
                        onInteraction('value_change', {
                            propName: 'checked',
                            previousValue: isChecked,
                            newValue: next,
                            semanticDescription: `User ${next ? 'checked' : 'unchecked'} "${props.label}"`,
                            measurementHint: measureSelectionTarget(e.currentTarget, 2),
                        });
                    }}
                />
                <span className="anya-checkbox-label">{props.label}</span>
            </label>
        );
    },
});
