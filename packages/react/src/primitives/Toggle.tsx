import React from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import {
    measurePointerInteraction,
    useSyncedState,
    type PrimitiveBehaviorProps,
    type PrimitiveRenderProps,
} from './shared';

interface ToggleProps extends PrimitiveBehaviorProps {
    label?: string;
    checked?: boolean;
    disabled?: boolean;
}

export const Toggle = defineComponent({
    name: 'Toggle',
    description: 'An on/off toggle switch.',
    propsSchema: z.object({
        label: z.string().optional(),
        checked: z.boolean().optional(),
        disabled: z.boolean().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'toggle'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<ToggleProps>) => {
        const [isOn, setIsOn] = useSyncedState(props.checked, false);
        return (
            <label
                id={id}
                className={`anya-toggle ${isOn ? 'anya-toggle-on' : ''} ${props.disabled ? 'anya-toggle-disabled' : ''} ${props.className || ''}`}
                style={props.style}
                {...props.dynamicInteractions}
            >
                <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    className="anya-toggle-track"
                    disabled={props.disabled}
                    onClick={(e) => {
                        const next = !isOn;
                        setIsOn(next);
                        onInteraction('value_change', {
                            propName: 'checked',
                            previousValue: isOn,
                            newValue: next,
                            semanticDescription: `User toggled "${props.label ?? 'switch'}" ${next ? 'on' : 'off'}`,
                            measurementHint: measurePointerInteraction(e, { choiceSetSize: 2 }),
                        });
                    }}
                >
                    <span className="anya-toggle-thumb" />
                </button>
                {props.label && <span className="anya-toggle-label">{props.label}</span>}
            </label>
        );
    },
});
