import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    measureSelectionTarget,
    useSyncedState,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface SliderProps extends PrimitiveBehaviorProps {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    label?: string;
    showValue?: boolean;
    disabled?: boolean;
}

export const Slider = defineComponent({
    name: 'Slider',
    description: 'A numeric range slider input.',
    propsSchema: z.object({
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().optional(),
        value: z.number().optional(),
        label: z.string().optional(),
        showValue: z.boolean().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'slider'],
    examples: [
        'type: Slider\nprops:\n  label: Zoom Level\n  value: { $data: { nodeId: "view_state", path: "zoom" } }\nbindTo:\n  - view_state',
        'type: Slider\nprops:\n  label: Hidden Dim\n  value: { $data: { nodeId: "model_params", path: "d_model" } }\nbindTo:\n  - model_params',
    ],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<SliderProps>) => {
        const min = props.min ?? 0;
        const max = props.max ?? 100;
        const [val, setVal] = useSyncedState(props.value, min);
        return (
            <div
                id={id}
                className={`anya-slider-wrapper ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                {props.label && <label className="anya-slider-label" htmlFor={`${id}-slider`}>{props.label}</label>}
                <div className="anya-slider-container">
                    <input
                        id={`${id}-slider`}
                        type="range"
                        className="anya-slider"
                        min={min}
                        max={max}
                        step={props.step ?? 1}
                        value={val}
                        disabled={props.disabled}
                        onChange={(e) => {
                            const newVal = Number(e.target.value);
                            setVal(newVal);
                            onInteraction('value_change', {
                                propName: 'value',
                                previousValue: val,
                                newValue: newVal,
                                semanticDescription: `User set slider "${props.label ?? 'range'}" to ${newVal}`,
                                measurementHint: measureSelectionTarget(e.currentTarget),
                            });
                        }}
                    />
                    {props.showValue && <span className="anya-slider-value">{val}</span>}
                </div>
            </div>
        );
    },
});
