import React, { useState } from 'react';
import { z } from 'zod';
import { defineComponent } from '../defineComponent';
import type { PrimitiveBehaviorProps, PrimitiveRenderProps } from './shared';

interface SearchInputProps extends PrimitiveBehaviorProps {
    placeholder?: string;
    value?: string;
    label?: string;
}

export const SearchInput = defineComponent({
    name: 'SearchInput',
    description: 'A text input styled for search with a search icon.',
    propsSchema: z.object({
        placeholder: z.string().optional(),
        value: z.string().optional(),
        label: z.string().optional(),
        className: z.string().optional(),
        style: z.record(z.any()).optional(),
    }),
    tags: ['form', 'input', 'search'],
    render: ({ id, props, onInteraction }: PrimitiveRenderProps<SearchInputProps>) => {
        const [val, setVal] = useState(props.value ?? '');
        return (
            <div id={id} className={`anya-search-input-wrapper ${props.className || ''}`} style={props.style}>
                {props.label && <label className="anya-search-label" htmlFor={`${id}-search`}>{props.label}</label>}
                <div className="anya-search-input-container">
                    <span className="anya-search-icon" aria-hidden="true">🔍</span>
                    <input
                        id={`${id}-search`}
                        type="search"
                        className="anya-search-input"
                        placeholder={props.placeholder ?? 'Search…'}
                        value={val}
                        onChange={(e) => {
                            const newVal = e.target.value;
                            setVal(newVal);
                            onInteraction('value_change', {
                                propName: 'value',
                                previousValue: val,
                                newValue: newVal,
                                semanticDescription: `User searched for "${newVal}"`,
                            });
                        }}
                    />
                </div>
            </div>
        );
    },
});
