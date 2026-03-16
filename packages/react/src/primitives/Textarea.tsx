import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    measureTextInputTarget,
    useSyncedState,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface TextareaProps extends PrimitiveBehaviorProps {
    placeholder?: string;
    value?: string;
    label?: string;
    rows?: number;
    disabled?: boolean;
}

export const Textarea = defineComponent({
    name: 'Textarea',
    description: 'A multi-line text area input. Reports value changes via onInteraction.',
    propsSchema: z.object({
        placeholder: z.string().optional(),
        value: z.string().optional(),
        label: z.string().optional(),
        rows: z.number().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<TextareaProps>) => {
        const [val, setVal] = useSyncedState(props.value, '');
        return (
            <div
                id={id}
                className={`anya-textarea-wrapper ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                {props.label && <label className="anya-textarea-label" htmlFor={`${id}-textarea`}>{props.label}</label>}
                <textarea
                    id={`${id}-textarea`}
                    className="anya-textarea"
                    placeholder={props.placeholder}
                    value={val}
                    rows={props.rows ?? 4}
                    disabled={props.disabled}
                    onChange={(e) => {
                        const newVal = e.target.value;
                        setVal(newVal);
                        onInteraction('value_change', {
                            propName: 'value',
                            previousValue: val,
                            newValue: newVal,
                            semanticDescription: `User typed in textarea`,
                            measurementHint: measureTextInputTarget(e.currentTarget),
                        });
                    }}
                />
            </div>
        );
    },
});
