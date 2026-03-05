import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface SliderProps extends PrimitiveBehaviorProps {
    min?: number;
    max?: number;
    step?: number;
    value?: number;
    label?: string;
    showValue?: boolean;
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
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'slider'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<SliderProps>) => {
        const min = props.min ?? 0;
        const max = props.max ?? 100;
        const [val, setVal] = useState(props.value ?? min);
        return (
            <div id={id} className={`anya-slider-wrapper ${props.className || ''}`} style={props.style}>
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
                        onChange={(e) => {
                            const newVal = Number(e.target.value);
                            setVal(newVal);
                            onInteraction('value_change', {
                                propName: 'value',
                                previousValue: val,
                                newValue: newVal,
                                semanticDescription: `User set slider "${props.label ?? 'range'}" to ${newVal}`,
                            });
                        }}
                        {...props.dynamicInteractions}
                    />
                    {props.showValue && <span className="anya-slider-value">{val}</span>}
                </div>
            </div>
        );
    },
});
